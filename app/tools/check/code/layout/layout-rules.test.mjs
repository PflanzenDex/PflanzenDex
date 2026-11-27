import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findLayout, hintLines, judgeLayout } from "./layout-rules.mjs";
import { unitCount, isIgnored, globMatch, familyOf, prefixProposal } from "./layout-tree.mjs";
import layoutConfig from "../../../../config/lint/layout.config.mjs";

const config = {
  maxUnits: 8,
  failUnits: 16,
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
// Units with six extensions in turn: no family reaches 8 files below 48 units, so no automatic collection applies.
const EXTS6 = ["md", "json", "css", "txt", "yml", "html"];
const spread = (dir, n) => Array.from({ length: n }, (_, i) => `${dir}/f${i}.${EXTS6[i % 6]}`);
// A reader of the README.md texts of a fixture (LY-1a, LY-7): the layout rules read no file themselves.
const readme = (texts) => (p) => texts[p];
const manifest = (expect) =>
  `---\ntopic: Test folder\nwhy: the files belong together\nexpect: ${expect}\n---\n# Test folder\n`;

describe("US-QG-09 LY-1 fan-out (size hint 8, hard limit 16 without a manifest, d-136, d-138)", () => {
  it("fails a directory above 16 units without a manifest, and names path and count", () => {
    const f = run(mixed("app/x", 17));
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
    assert.equal(f[0].value, 17);
  });
  it("prints a hint, and does not fail, for 9 to 16 units without a manifest", () => {
    for (const n of [9, 16]) {
      const r = judgeLayout(mixed("app/x", n), config);
      assert.deepEqual(r.findings, [], `${n} units`);
      assert.deepEqual(
        r.hints.map((h) => [h.dir, h.units, h.size]),
        [["app/x", n, 8]],
        `${n} units`,
      );
    }
  });
  it("accepts exactly 8 units without a hint", () => {
    const r = judgeLayout(mixed("app/x", 8), config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.hints, []);
  });
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
    assert.deepEqual(judgeLayout([...mixed("app/x", 7), "app/x/sub/a.ts"], config).hints, []);
    const hinted = judgeLayout([...mixed("app/x", 8), "app/x/sub/a.ts"], config).hints;
    assert.deepEqual(
      hinted.map((h) => h.units),
      [9],
      "8 files and a directory are 9 units",
    );
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
  const ts8 = Array.from({ length: 8 }, (_, i) => `app/x/f${i}.ts`);
  const subfolders = (n) => Array.from({ length: n }, (_, i) => `app/x/s${i + 1}/a.md`);
  it("US-QG-09 (d-135): 8 files of one family and 9 subfolders print the hint, the subfolders count", () => {
    const r = judgeLayout([...ts8, ...subfolders(9)], config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
    );
  });
  it("US-QG-09 (d-135): 8 files of one family and 17 subfolders fail LY-1, the subfolders count", () => {
    const f = run([...ts8, ...subfolders(17)]);
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
    assert.equal(f[0].value, 17);
  });
  it("US-QG-09 (d-135): 8 files of one family and 3 subfolders pass without a hint", () => {
    const r = judgeLayout([...ts8, ...subfolders(3)], config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.hints, []);
  });
  it("US-QG-09 (d-133): 7 files of one family and 2 other units print the hint at 9 units", () => {
    const r = judgeLayout([...files("app/x", 7), "app/x/notes.json", "app/x/sub/a.ts"], config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
    );
  });
  it("counts .ts and .tsx as one family, and .js, .jsx and .mjs as one family", () => {
    const tsx = ts("app/x", ["a.ts", "b.tsx", "c.ts", "d.tsx", "e.ts", "f.tsx", "g.ts", "h.tsx"]);
    const js = ts("app/x", ["a.js", "b.jsx", "c.mjs", "d.js", "e.jsx", "f.mjs", "g.js", "h.jsx"]);
    assert.deepEqual(run(tsx), []);
    assert.deepEqual(run(js), []);
  });
  it("does not merge two families: 4 .ts, 4 .js and one .md print the hint at 9 units", () => {
    const paths = [
      ...ts("app/x", ["a.ts", "b.ts", "c.ts", "d.ts"]),
      ...ts("app/x", ["e.js", "f.js", "g.js", "h.js"]),
      "app/x/z.md",
    ];
    const r = judgeLayout(paths, config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
      "merged, the 8 files would be a collection and no hint would fire",
    );
  });
  it("gives no collection to 3 .ts, 3 .md and 3 subdirectories: the hint names 9 units", () => {
    const paths = [
      ...ts("app/x", ["a.ts", "b.ts", "c.ts", "d.md", "e.md", "f.md"]),
      "app/x/s1/a.md",
      "app/x/s2/a.md",
      "app/x/s3/a.md",
    ];
    const r = judgeLayout(paths, config);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
    );
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
  it("counts the other entries of a package root: 8 pass without a hint, 9 print one, 17 fail", () => {
    const src = [`${web}/src/a.ts`, `${web}/public/x.txt`];
    assert.deepEqual(judgeLayout([...toolFiles, ...src, ...mixed(web, 6)], layoutConfig).hints, []);
    const hinted = judgeLayout([...toolFiles, ...src, ...mixed(web, 7)], layoutConfig);
    assert.deepEqual(
      hinted.hints.map((h) => h.units),
      [9],
    );
    const f = findLayout([...toolFiles, ...src, ...mixed(web, 15)], layoutConfig);
    assert.deepEqual(rules(f), [`LY-1 ${web}`]);
    assert.equal(f[0].value, 17);
  });
  it("still checks the name of a tool configuration file (LY-3)", () => {
    assert.deepEqual(rules(findLayout([`${web}/Vite.config.ts`], layoutConfig)), [`LY-3 ${web}`]);
  });
  it("counts the same tool files outside a package root: 9 units print the hint", () => {
    const r = judgeLayout([...mixed("app/x", 8), "app/x/vite.config.ts"], layoutConfig);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
    );
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
  it("gives a folder inside a spike the default unit rule: 9 units print a hint, 17 fail", () => {
    const folder = `${spikes}/2026-11-26-lint-rules/data`;
    assert.deepEqual(
      judgeLayout(mixed(folder, 9), layoutConfig).hints.map((h) => h.dir),
      [folder],
    );
    assert.deepEqual(rules(findLayout(mixed(folder, 17), layoutConfig)), [`LY-1 ${folder}`]);
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
  it("does not apply in a collection directory: a flat component file is the layout there (R3, issue 2509)", () => {
    const dirs = [
      ...config.dirs,
      { path: "app/web/ui", collection: /^[a-z]+(\.(stories|test))?\.tsx$/ },
    ];
    assert.deepEqual(run(["app/web/ui/badge.tsx", "app/web/ui/badge.test.tsx"], { dirs }), []);
  });
  it("still applies next to a collection directory and below it", () => {
    const dirs = [
      ...config.dirs,
      { path: "app/web/ui", collection: /^[a-z]+(\.(stories|test))?\.tsx$/ },
    ];
    const f = run(["app/web/ui/badge.tsx", "app/web/other/badge.tsx", "app/web/ui/x/y.tsx"], {
      dirs,
    });
    assert.deepEqual(
      rules(f).sort(),
      ["LY-2 app/web/ui", "LY-4 app/web/ui/x", "LY-4 app/web/other"].sort(),
    );
  });
});

describe("US-QG-09 LY-2 flat UI primitives (R3, owner decisions d-132 and d-133, issue 2509)", () => {
  const ui = "app/packages/web/src/shared/ui";
  const flat = [
    "button.tsx",
    "button.stories.tsx",
    "button.test.tsx",
    "button.de.json",
    "button.roles.ts",
    "form-bar.slot.tsx",
    "form-bar.page.tsx",
    "sheet.height.test.tsx",
    "sheet.detents.test.ts",
    "sheet.test-helpers.ts",
    "input.date-field.de.json",
    "layer-scope.ts",
  ];
  it("accepts a collection of flat primitives with no unit limit and no LY-4", () => {
    const many = Array.from({ length: 40 }, (_, i) => `part${i}.tsx`);
    const paths = [...flat, ...many].map((n) => `${ui}/${n}`);
    assert.deepEqual(findLayout(paths, layoutConfig), []);
    assert.deepEqual(judgeLayout(paths, layoutConfig).hints, []);
  });
  it("fails a subfolder, a capital or snake_case name, a foreign extension and a name with two kinds", () => {
    const bad = ["Button.tsx", "button_roles.ts", "button.css", "button.stories.json", "a.b.c.tsx"];
    const f = findLayout(
      [...bad.map((n) => `${ui}/${n}`), `${ui}/button/button.tsx`],
      layoutConfig,
    );
    assert.deepEqual(rules(f), [`LY-2 ${ui}`]);
    assert.deepEqual(f[0].items.sort(), [...bad, "button"].sort());
  });
  it("keeps LY-4 for a component elsewhere in the web package", () => {
    const f = findLayout(
      [`${ui}/button.tsx`, "app/packages/web/src/shared/patterns/badge.tsx"],
      layoutConfig,
    );
    assert.deepEqual(rules(f), ["LY-4 app/packages/web/src/shared/patterns"]);
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

describe("US-QG-09 LY-1a manifest raises or lowers the unit limit (d-136)", () => {
  const dir = "app/x";
  const readmePath = `${dir}/README.md`;
  it("a directory with 25 units and a manifest of expect 25 passes and prints no hint", () => {
    const r = judgeLayout(
      [...spread(dir, 24), readmePath],
      config,
      readme({ [readmePath]: manifest(25) }),
    );
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.hints, []);
  });
  it("a 26th unit fails LY-1 with the path, the number of units and the expect", () => {
    const f = findLayout(
      [...spread(dir, 25), readmePath],
      config,
      readme({ [readmePath]: manifest(25) }),
    );
    assert.deepEqual(rules(f), [`LY-1 ${dir}`]);
    assert.equal(f[0].value, 26);
    assert.match(f[0].items[0], /26 units, expect 25 \(manifest\)/);
  });
  it("an expect below the size hint is allowed: 5 units pass, 6 units fail LY-1", () => {
    const texts = readme({ [readmePath]: manifest(5) });
    assert.deepEqual(findLayout([...spread(dir, 4), readmePath], config, texts), []);
    assert.deepEqual(rules(findLayout([...spread(dir, 5), readmePath], config, texts)), [
      `LY-1 ${dir}`,
    ]);
  });
  it("a manifest with no more units than its expect prints no hint, also above the size hint", () => {
    const r = judgeLayout(
      [...spread(dir, 8), readmePath],
      config,
      readme({ [readmePath]: manifest(10) }),
    );
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.hints, []);
  });
  it("the per-path rule of a directory wins over its manifest: 10 units pass, 11 fail", () => {
    const cfg = { ...config, dirs: [{ path: "app/*", maxUnits: 10 }] };
    const texts = readme({ [readmePath]: manifest(25) });
    assert.deepEqual(findLayout([...spread(dir, 9), readmePath], cfg, texts), []);
    const f = findLayout([...spread(dir, 10), readmePath], cfg, texts);
    assert.deepEqual(rules(f), [`LY-1 ${dir}`]);
    assert.match(f[0].items[0], /limit 10 \(per-path rule\)/);
  });
  it("a README without frontmatter is no manifest: the size hint applies", () => {
    const r = judgeLayout(
      [...spread(dir, 8), readmePath],
      config,
      readme({ [readmePath]: "# Test folder\n" }),
    );
    assert.deepEqual(r.findings, []);
    assert.deepEqual(
      r.hints.map((h) => h.units),
      [9],
    );
  });
  it("a README in a folder with a dot is no manifest and reads no text", () => {
    const hidden = ".claude/x/README.md";
    const r = judgeLayout(
      [hidden, ...spread(dir, 2)],
      config,
      readme({ [hidden]: "---\ntopic: a\n---\n" }),
    );
    assert.deepEqual(r.findings, []);
  });
});

describe("US-QG-09 LY-7 malformed manifest fails with the path and the key (d-136)", () => {
  const dir = "app/x";
  const readmePath = `${dir}/README.md`;
  const cases = [
    ["has no topic", "---\nwhy: a\nexpect: 25\n---\n", "topic missing"],
    ["has an empty why", "---\ntopic: a\nwhy:\nexpect: 25\n---\n", "why empty"],
    ["has no expect", "---\ntopic: a\nwhy: b\n---\n", "expect missing"],
    [
      "has expect many",
      "---\ntopic: a\nwhy: b\nexpect: many\n---\n",
      'expect "many" is not a whole number above 0',
    ],
    [
      "has expect 0",
      "---\ntopic: a\nwhy: b\nexpect: 0\n---\n",
      'expect "0" is not a whole number above 0',
    ],
  ];
  for (const [label, text, problem] of cases) {
    it(`US-QG-09 LY-7: a manifest that ${label} fails with LY-7, the path and the key`, () => {
      const f = findLayout([readmePath, ...spread(dir, 2)], config, readme({ [readmePath]: text }));
      assert.deepEqual(rules(f), [`LY-7 ${dir}`]);
      assert.deepEqual(f[0].items, [`${readmePath}: ${problem}`]);
    });
  }
});

describe("US-QG-09 LY-1b subfolder hint (d-136)", () => {
  const dir = "app/x";
  const plant = [
    "plant-layer-sheet.tsx",
    "plant-layer-tabs.tsx",
    "plant-layer-photos.tsx",
    "plant-layer-care.tsx",
  ];
  it("names the prefix and its file count, before the manifest hint, when the size hint fires", () => {
    const paths = [...plant.map((n) => `${dir}/${n}`), ...spread(dir, 6)];
    const hint = judgeLayout(paths, config).hints[0];
    assert.deepEqual(hint.prefix, { name: "plant-layer-", files: 4 });
    const lines = hintLines(hint);
    const proposal = lines.findIndex((l) => l.includes("plant-layer-"));
    const manifestLine = lines.findIndex((l) => /manifest/.test(l));
    assert.ok(proposal >= 0 && proposal < manifestLine, lines.join("\n"));
  });
  it("names no prefix when no prefix is shared by 3 files", () => {
    const paths = [
      `${dir}/alpha-one.md`,
      `${dir}/alpha-two.md`,
      `${dir}/beta-one.md`,
      `${dir}/beta-two.md`,
      ...spread(dir, 5),
    ];
    const hint = judgeLayout(paths, config).hints[0];
    assert.equal(hint.units, 9);
    assert.equal(hint.prefix, undefined);
    assert.ok(!hintLines(hint).join("\n").includes("start with"));
  });
  it("names the longest prefix that 3 files share", () => {
    const paths = [
      `${dir}/plant-layer-sheet-a.tsx`,
      `${dir}/plant-layer-sheet-b.tsx`,
      `${dir}/plant-layer-sheet-c.tsx`,
      `${dir}/plant-layer-tabs.tsx`,
      ...spread(dir, 6),
    ];
    assert.deepEqual(judgeLayout(paths, config).hints[0].prefix, {
      name: "plant-layer-sheet-",
      files: 3,
    });
  });
  it("needs 3 files for a prefix, and counts files, not units", () => {
    assert.equal(prefixProposal(["a-b-1.ts", "a-b-2.ts"]), undefined);
    assert.deepEqual(prefixProposal(["a-b-1.ts", "a-b-2.ts", "a-b-3.md"]), {
      name: "a-b-",
      files: 3,
    });
    assert.deepEqual(
      prefixProposal([
        "plant-layer-sheet.tsx",
        "plant-layer-sheet.test.tsx",
        "plant-layer-sheet.stories.tsx",
      ]),
      { name: "plant-layer-", files: 3 },
    );
    assert.equal(prefixProposal(["plant.tsx", "plant.md", "plant.css"]), undefined);
  });
});
