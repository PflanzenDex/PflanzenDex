import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findLayout } from "./layout-rules.mjs";
import { unitCount, isIgnored, globMatch, familyOf } from "./layout-tree.mjs";
import layoutConfig from "../../../../config/lint/layout.config.mjs";

const config = {
  maxUnits: 8,
  autoCollectionMin: 8,
  rootFiles: ["README.md", "Makefile"],
  rootDirs: ["app", "docs"],
  namedFiles: ["README.md", "Makefile"],
  componentRoots: ["app/web"],
  componentExempt: ["main"],
  dirs: [{ path: "app/migrations", collection: /^\d{4}_[a-z_]+\.sql$/ }],
};
const run = (paths, extra = {}) => findLayout(paths, { ...config, ...extra });
const rules = (fs) => fs.map((f) => `${f.rule} ${f.dir}`);
const files = (dir, n) => Array.from({ length: n }, (_, i) => `${dir}/f${i}.md`);
// n files with three extensions in turn: no family reaches 8 files below n = 24, so no automatic collection applies (d-133).
const EXTS = ["md", "json", "css"];
const mixed = (dir, n) => Array.from({ length: n }, (_, i) => `${dir}/f${i}.${EXTS[i % 3]}`);
const ts = (dir, names) => names.map((n) => `${dir}/${n}`);

describe("US-QG-09 LY-1 fan-out", () => {
  it("fails a directory with more than 8 units and names path and count", () => {
    const f = run(mixed("app/x", 9));
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
    assert.equal(f[0].value, 9);
  });
  it("accepts exactly 8 units", () => assert.deepEqual(run(mixed("app/x", 8)), []));
  it("counts files with the same stem once", () => {
    const paths = [
      "card.tsx",
      "card.test.tsx",
      "card.stories.tsx",
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
    ].map((n) => `app/x/${n}`);
    assert.equal(unitCount(new Map(paths.map((p) => [p.split("/")[2], "file"]))), 5);
    assert.deepEqual(run(paths), []);
  });
  it("counts a directory and a file with the same stem once", () => {
    assert.deepEqual(run([...files("app/x", 4), "app/x/f0/a.ts"]), []);
  });
  it("counts a directory as one unit", () => {
    assert.deepEqual(run([...mixed("app/x", 7), "app/x/sub/a.ts"]), []);
    assert.deepEqual(rules(run([...mixed("app/x", 8), "app/x/sub/a.ts"])), ["LY-1 app/x"]);
  });
  it("ignores entries starting with a dot", () => {
    assert.equal(isIgnored(".claude/rules/a.md"), true);
    assert.deepEqual(run([...mixed("app/x", 8), "app/x/.hidden", ".github/a.yml"]), []);
  });
  it("honours a per-directory limit", () => {
    const extra = { dirs: [{ path: "app/*", maxUnits: 10 }] };
    assert.deepEqual(run(mixed("app/x", 10), extra), []);
    assert.deepEqual(rules(run(mixed("app/x", 11), extra)), ["LY-1 app/x"]);
  });
});

describe("US-QG-09 LY-1 automatic collection (d-133)", () => {
  it("lets a directory without a rule hold 12 files of one family, no unit limit", () => {
    assert.deepEqual(run(files("app/x", 12)), []);
  });
  it("collects 8 files of one family, so one more unit still passes", () => {
    assert.deepEqual(run([...files("app/x", 8), "app/x/notes.json"]), []);
  });
  it("fails a mixed directory with 7 files of one family and 2 other units at 9 units", () => {
    assert.deepEqual(rules(run([...files("app/x", 7), "app/x/notes.json", "app/x/sub/a.ts"])), [
      "LY-1 app/x",
    ]);
  });
  it("counts .ts and .tsx as one family, and .js, .jsx and .mjs as one family", () => {
    const tsx = ts("app/x", ["a.ts", "b.tsx", "c.ts", "d.tsx", "e.ts", "f.tsx", "g.ts", "h.tsx"]);
    const js = ts("app/x", ["a.js", "b.jsx", "c.mjs", "d.js", "e.jsx", "f.mjs", "g.js", "h.jsx"]);
    assert.deepEqual(run(tsx), []);
    assert.deepEqual(run(js), []);
  });
  it("does not merge two families: 4 .ts, 4 .js and one .md are 9 units", () => {
    const paths = [
      ...ts("app/x", ["a.ts", "b.ts", "c.ts", "d.ts"]),
      ...ts("app/x", ["e.js", "f.js", "g.js", "h.js"]),
      "app/x/z.md",
    ];
    assert.deepEqual(rules(run(paths)), ["LY-1 app/x"]);
  });
  it("gives no collection to 3 .ts, 3 .md and 3 subdirectories (9 units)", () => {
    const paths = [
      ...ts("app/x", ["a.ts", "b.ts", "c.ts", "d.md", "e.md", "f.md"]),
      "app/x/s1/a.md",
      "app/x/s2/a.md",
      "app/x/s3/a.md",
    ];
    assert.deepEqual(rules(run(paths)), ["LY-1 app/x"]);
  });
  it("still enforces kebab-case names (LY-3) in an automatic collection", () => {
    const paths = [...files("app/x", 11), "app/x/Bad_Name.md"];
    assert.deepEqual(rules(run(paths)), ["LY-3 app/x"]);
  });
  it("gives a directory with a per-path rule no automatic collection", () => {
    assert.deepEqual(rules(run(files("app/x", 12), { dirs: [{ path: "app/*", maxUnits: 10 }] })), [
      "LY-1 app/x",
    ]);
  });
  it("gives the family of a file by its last extension, none for a file without one", () => {
    assert.equal(familyOf("card.test.tsx"), "ts");
    assert.equal(familyOf("eslint.config.mjs"), "js");
    assert.equal(familyOf("messages_de.properties"), "properties");
    assert.equal(familyOf("Makefile"), undefined);
  });
});

describe("US-QG-09 LY-1 package roots (d-133)", () => {
  const web = "app/packages/web";
  const toolFiles = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "eslint.config.js",
    "components.json",
  ].map((n) => `${web}/${n}`);
  it("counts the tool configuration files of a package root as no units", () => {
    const paths = [...toolFiles, `${web}/src/a.ts`, `${web}/public/x.txt`];
    assert.deepEqual(findLayout(paths, layoutConfig), []);
  });
  it("counts the other entries of a package root: 8 pass, 9 fail", () => {
    const src = [`${web}/src/a.ts`, `${web}/public/x.txt`];
    assert.deepEqual(findLayout([...toolFiles, ...src, ...mixed(web, 6)], layoutConfig), []);
    const f = findLayout([...toolFiles, ...src, ...mixed(web, 7)], layoutConfig);
    assert.deepEqual(rules(f), [`LY-1 ${web}`]);
    assert.equal(f[0].value, 9);
  });
  it("still checks the name of a tool configuration file (LY-3)", () => {
    assert.deepEqual(rules(findLayout([`${web}/Vite.config.ts`], layoutConfig)), [`LY-3 ${web}`]);
  });
  it("counts the same tool files outside a package root", () => {
    const f = findLayout([...mixed("app/x", 8), "app/x/vite.config.ts"], layoutConfig);
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
  });
});

describe("US-QG-09 LY-2 collections", () => {
  const sql = (n) => `app/migrations/${String(n).padStart(4, "0")}_a.sql`;
  it("exempts a collection from the limit when every entry matches", () => {
    assert.deepEqual(run(Array.from({ length: 30 }, (_, i) => sql(i))), []);
  });
  it("fails an entry that does not match the pattern", () => {
    const f = run([sql(1), "app/migrations/notes.md"]);
    assert.deepEqual(rules(f), ["LY-2 app/migrations"]);
    assert.deepEqual(f[0].items, ["notes.md"]);
  });
});

describe("US-QG-09 LY-2 dated spike folders (d-133)", () => {
  const spikes = "docs/records/spikes";
  it("accepts dated topics and te-15-oauth with no unit limit", () => {
    const dated = Array.from(
      { length: 12 },
      (_, i) => `${spikes}/2026-11-${String(i + 1).padStart(2, "0")}-topic-${i}/README.md`,
    );
    const paths = [...dated, `${spikes}/te-15-oauth/result.md`];
    assert.deepEqual(findLayout(paths, layoutConfig), []);
  });
  it("fails a date-only entry and a topic without a date", () => {
    const f = findLayout(
      [`${spikes}/2026-11-26/README.md`, `${spikes}/lint-rules/README.md`],
      layoutConfig,
    );
    assert.deepEqual(rules(f), [`LY-2 ${spikes}`]);
    assert.deepEqual(f[0].items.sort(), ["2026-11-26", "lint-rules"]);
  });
  it("keeps the flat names inside a spike folder kebab-case, README.md and images allowed", () => {
    const folder = `${spikes}/2026-11-26-lint-rules`;
    const paths = [
      `${folder}/README.md`,
      `${folder}/consent-keycloak.png`,
      `${folder}/Notes_Draft.md`,
    ];
    const f = findLayout(paths, layoutConfig);
    assert.deepEqual(rules(f), [`LY-2 ${folder}`]);
    assert.deepEqual(f[0].items, ["Notes_Draft.md"]);
  });
  it("gives a folder inside a spike the default unit limit", () => {
    const f = findLayout(mixed(`${spikes}/2026-11-26-lint-rules/data`, 9), layoutConfig);
    assert.deepEqual(rules(f), [`LY-1 ${spikes}/2026-11-26-lint-rules/data`]);
  });
});

describe("US-QG-09 LY-3 names", () => {
  it("fails names that are not kebab-case", () => {
    const f = run([
      "app/x/CamelCase.ts",
      "app/x/snake_case.ts",
      "app/Big/a.ts",
      "app/x/ok-name.ts",
    ]);
    assert.deepEqual(rules(f).sort(), ["LY-3 app", "LY-3 app/x"]);
  });
  it("accepts conventional file names and dots in the extension", () => {
    assert.deepEqual(run(["README.md", "Makefile", "app/x/a.test.tsx", "app/x/b.d.mts"]), []);
  });
});

describe("US-QG-09 LY-4 component folders", () => {
  it("fails a component file that is not in a folder of the same name", () => {
    const f = run(["app/web/badge.tsx", "app/web/badge.test.tsx"]);
    assert.deepEqual(rules(f), ["LY-4 app/web"]);
  });
  it("accepts a component in its own folder and exempt entry points", () => {
    assert.deepEqual(
      run(["app/web/badge/badge.tsx", "app/web/badge/badge.test.tsx", "app/web/main.tsx"]),
      [],
    );
  });
  it("only applies below the component roots", () => {
    assert.deepEqual(run(["app/other/thing.tsx"]), []);
  });
});

describe("US-QG-09 LY-5 repo root", () => {
  it("fails files and directories that are not on the whitelist", () => {
    const f = run(["README.md", "NOTES.md", "scripts/a.sh", "app/a.ts"]);
    assert.deepEqual(
      rules(f).filter((r) => r.startsWith("LY-5")),
      ["LY-5 ."],
    );
    assert.deepEqual(f.find((x) => x.rule === "LY-5").items.sort(), ["NOTES.md", "scripts"]);
  });
  it("does not count whitelisted root files towards the limit", () => {
    assert.deepEqual(run(["README.md", "Makefile", "app/a.ts", "docs/a.md"]), []);
  });
});

describe("US-QG-09 LY-3 exemption for Keycloak message bundles (owner decision 2026-10-30, #1077)", () => {
  const theme = "app/config/dev/keycloak-theme/pflanzendex/login";
  it("accepts the message bundles of a Keycloak login theme with the layout config of the repo", () => {
    const bundles = [
      `${theme}/messages/messages_de.properties`,
      `${theme}/messages/messages_pt_BR.properties`,
    ];
    assert.deepEqual(findLayout(bundles, layoutConfig), []);
  });
  it("still fails other non-kebab names in the same theme", () => {
    const f = findLayout(
      [`${theme}/resources/css/Brand_Styles.css`, `${theme}/messages/notes_de.properties`],
      layoutConfig,
    );
    assert.deepEqual(rules(f).sort(), [`LY-3 ${theme}/messages`, `LY-3 ${theme}/resources/css`]);
  });
  it("does not exempt a message bundle outside the sign-in theme", () => {
    const f = findLayout(["app/packages/web/src/messages_de.properties"], layoutConfig);
    assert.deepEqual(rules(f), ["LY-3 app/packages/web/src"]);
  });
});

describe("US-QG-09 LY-3 exemption pattern", () => {
  it("matches whole paths: ** spans segments, * stays inside one segment", () => {
    assert.equal(globMatch("a/**/m/x_*.p", "a/b/c/m/x_de.p"), true);
    assert.equal(globMatch("a/**/m/x_*.p", "a/m/x_.p"), true);
    assert.equal(globMatch("a/**/m/x_*.p", "a/b/m/y_de.p"), false);
    assert.equal(globMatch("a/*/m", "a/b/c/m"), false);
    assert.equal(globMatch("a/*/m", "a/b/m"), true);
  });
});
