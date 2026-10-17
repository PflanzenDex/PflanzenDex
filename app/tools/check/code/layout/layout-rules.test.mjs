import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findLayout } from "./layout-rules.mjs";
import { unitCount, isIgnored } from "./layout-tree.mjs";

const config = {
  maxUnits: 5,
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

describe("US-QG-09 LY-1 fan-out", () => {
  it("fails a directory with more than 5 units and names path and count", () => {
    const f = run(files("app/x", 6));
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
    assert.equal(f[0].value, 6);
  });
  it("accepts exactly 5 units", () => assert.deepEqual(run(files("app/x", 5)), []));
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
    assert.deepEqual(rules(run([...files("app/x", 5), "app/x/sub/a.ts"])), ["LY-1 app/x"]);
  });
  it("ignores entries starting with a dot", () => {
    assert.equal(isIgnored(".claude/rules/a.md"), true);
    assert.deepEqual(run([...files("app/x", 5), "app/x/.hidden", ".github/a.yml"]), []);
  });
  it("honours a per-directory limit", () => {
    assert.deepEqual(run(files("app/x", 8), { dirs: [{ path: "app/*", maxUnits: 10 }] }), []);
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
