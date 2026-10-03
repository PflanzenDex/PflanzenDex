import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { checkProject } from "./check-boundaries.mjs";
import { kernelExports } from "./check-modules-sql.mjs";
import { MODULE_CONFIG as REAL } from "../modules.config.mjs";

// Module rules AB-7 to AB-14 (FR-QG-19): each rule has a clean case and a violating fixture.
const CFG = {
  KERN: "kern",
  MODULES: [
    { name: "kern", epics: [], tables: ["konto"], dependsOn: [], ports: [] },
    { name: "licht", epics: [], tables: ["zone"], dependsOn: ["kern"], ports: [] },
    { name: "bestand", epics: [], tables: ["topf"], dependsOn: ["kern", "licht"], ports: [] },
    { name: "pflege", epics: [], tables: ["gabe"], dependsOn: ["kern", "bestand"], ports: [] },
  ],
  LEGACY_MIGRATIONS: {},
  UNMODULED_FOLDERS: {},
  MODULE_FOLDERS_IN_TRANSITION: {},
};
const cfg = (patch = {}) => ({ ...CFG, ...patch });

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "modules-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const idx = (n) => `packages/core/src/${n}/index.ts`;
const clean = {
  [idx("kern")]: "export const k = 1;\n",
  [idx("licht")]: 'import { k } from "../kern/index.ts";\nexport const l = k;\n',
  [idx("bestand")]: 'import { l } from "../licht";\nexport const b = l;\n',
  [idx("pflege")]: 'import { b } from "../bestand/index.ts";\nexport const p = b;\n',
  "packages/core/src/index.ts": 'export * from "./pflege";\n',
};
const run = (files, c = CFG) => checkProject(project({ ...clean, ...files }), c);

describe("module boundaries (FR-QG-19)", () => {
  it("a clean module layout has no violations", () => assert.deepEqual(run({}), []));

  it("the real register passes on the real tree and has a valid shape", () => {
    const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    assert.deepEqual(
      checkProject(appDir, REAL).filter((v) => /^AB-(7|8|9|1[1-4]) /.test(v)),
      [],
    );
  });

  it("without module folders the module checks are idle", () => {
    assert.deepEqual(
      checkProject(project({ "packages/core/src/index.ts": "export const x = 1;\n" }), CFG),
      [],
    );
  });

  describe("AB-7 public interface only", () => {
    it("an import of an internal file of another module fails with the edge", () => {
      const v = run({
        "packages/core/src/pflege/p.ts":
          'import { x } from "../bestand/intern.ts";\nexport const y = x;\n',
        "packages/core/src/bestand/intern.ts": "export const x = 1;\n",
      });
      assert.equal(v.length, 1);
      assert.match(v[0], /^AB-7 packages\/core\/src\/pflege\/p\.ts:1 pflege -> bestand: /);
    });
    it("a root file (barrel, composition root) may not reach into a module either", () => {
      const v = run({ "packages/core/src/app.ts": 'export * from "./licht/intern.ts";\n' });
      assert.match(v.join("\n"), /^AB-7 packages\/core\/src\/app\.ts:1 root -> licht: /m);
    });
    it("a module folder without index.ts fails", () => {
      const files = Object.fromEntries(Object.entries(clean).filter(([k]) => k !== idx("licht")));
      const v = checkProject(
        project({ ...files, "packages/core/src/licht/z.ts": "export const z = 1;\n" }),
        CFG,
      );
      assert.ok(
        v.some((x) => /^AB-7 packages\/core\/src\/licht\/index\.ts /.test(x)),
        v.join("\n"),
      );
    });
    it("test files and testhilfe.ts are exempt from AB-7, but not from the matrix", () => {
      const files = {
        "packages/core/src/bestand/intern.ts": "export const x = 1;\n",
        "packages/core/src/bestand/testhilfe.ts": "export const t = 1;\n",
        "packages/core/src/pflege/p.test.ts":
          'import { x } from "../bestand/intern.ts";\nexport const y = x;\n',
        "packages/core/src/pflege/q.test.ts":
          'import { t } from "../bestand/testhilfe";\nexport const y = t;\n',
      };
      assert.deepEqual(run(files), []);
      const v = run({
        ...files,
        "packages/core/src/licht/l.test.ts":
          'import { x } from "../bestand/intern.ts";\nexport const y = x;\n',
      });
      assert.ok(
        v.some((x) => /^AB-12 .*l\.test\.ts:1 licht -> bestand/.test(x)),
        v.join("\n"),
      );
      assert.ok(!v.some((x) => x.startsWith("AB-7")));
    });
    it("imports inside one module are free", () => {
      assert.deepEqual(
        run({
          "packages/core/src/licht/z.ts": 'import { l } from "./index.ts";\nexport const z = l;\n',
        }),
        [],
      );
    });
  });

  describe("AB-8 dependency matrix and cycles", () => {
    it("an edge outside the matrix fails with rule, file, line and edge", () => {
      const v = run({
        "packages/core/src/licht/x.ts":
          '\nimport { p } from "../pflege/index.ts";\nexport const q = p;\n',
      });
      assert.match(v[0], /^AB-8 packages\/core\/src\/licht\/x\.ts:2 licht -> pflege: /);
    });
    it("a cycle in the matrix fails", () => {
      const c = cfg({
        MODULES: [
          { ...CFG.MODULES[0] },
          { ...CFG.MODULES[1], dependsOn: ["kern", "bestand"] },
          { ...CFG.MODULES[2], dependsOn: ["kern", "licht"] },
          CFG.MODULES[3],
        ],
      });
      const v = checkProject(project(clean), c);
      assert.ok(
        v.some((x) => /^AB-8 modules\.config\.mjs cycle (licht|bestand) -> /.test(x)),
        v.join("\n"),
      );
    });
    it("a cycle through real imports fails (the matrix allows the edge in both directions)", () => {
      const c = cfg({
        MODULES: [
          CFG.MODULES[0],
          { ...CFG.MODULES[1], dependsOn: ["kern", "pflege"] },
          CFG.MODULES[2],
          { ...CFG.MODULES[3], dependsOn: ["kern", "bestand", "licht"] },
        ],
      });
      const v = checkProject(
        project({
          ...clean,
          "packages/core/src/licht/x.ts":
            'import { p } from "../pflege/index.ts";\nexport const q = p;\n',
        }),
        c,
      );
      assert.ok(
        v.some((x) => /^AB-8 .*cycle /.test(x)),
        v.join("\n"),
      );
    });
    it("a module depending on itself or on an unknown module fails", () => {
      const c = cfg({
        MODULES: [
          CFG.MODULES[0],
          { ...CFG.MODULES[1], dependsOn: ["kern", "licht", "gibtsnicht"] },
        ],
      });
      const v = checkProject(project({}), c);
      assert.ok(v.some((x) => /^AB-8 modules\.config\.mjs .*itself/.test(x)));
      assert.ok(v.some((x) => /^AB-13 modules\.config\.mjs .*unknown module gibtsnicht/.test(x)));
    });
  });

  describe("AB-9 SQL only on own tables", () => {
    const adapter = (sql) => ({
      "packages/db/src/pflege/index.ts": "export {};\n",
      "packages/db/src/pflege/gabe.ts": `\nexport const q = \`${sql}\`;\n`,
    });
    it("SQL on a table of another module fails with the edge", () => {
      const v = run(adapter("select * from gabe join topf on true"));
      assert.equal(v.length, 1);
      assert.match(
        v[0],
        /^AB-9 packages\/db\/src\/pflege\/gabe\.ts:2 pflege -> bestand: .*table topf/,
      );
    });
    it("SQL on own tables and on the kernel is fine", () => {
      assert.deepEqual(run(adapter("select * from gabe join konto on true")), []);
    });
  });

  describe("AB-11 the kernel imports no domain module", () => {
    it("kern importing a module fails", () => {
      const v = run({
        "packages/core/src/kern/x.ts":
          'import { l } from "../licht/index.ts";\nexport const q = l;\n',
      });
      assert.match(v[0], /^AB-11 packages\/core\/src\/kern\/x\.ts:1 kern -> licht: /);
    });
    it("a kernel with dependencies in the register fails", () => {
      const c = cfg({
        MODULES: [{ ...CFG.MODULES[0], dependsOn: ["licht"] }, ...CFG.MODULES.slice(1)],
      });
      assert.ok(
        checkProject(project(clean), c).some((x) => /^AB-11 modules\.config\.mjs /.test(x)),
      );
    });
    it("reports the number of kernel exports as a measure", () => {
      const dir = project({
        [idx("kern")]:
          "export const a = 1;\nexport { b, c } from './x';\nexport type T = string;\n",
      });
      assert.equal(kernelExports({ appDir: dir, cfg: CFG, h: { stripComments: (s) => s } }), 4);
    });
  });

  describe("AB-12 only the root couples upwards or imports everything", () => {
    it("an import against an allowed edge (upwards) fails and points to a port", () => {
      const v = run({
        "packages/core/src/bestand/x.ts":
          'import { p } from "../pflege/index.ts";\nexport const q = p;\n',
      });
      assert.match(v[0], /^AB-12 packages\/core\/src\/bestand\/x\.ts:1 bestand -> pflege: .*port/);
    });
    it("a module importing every other module fails, the root may", () => {
      const c = cfg({
        MODULES: CFG.MODULES.map((m) =>
          m.name === "pflege" ? { ...m, dependsOn: ["kern", "bestand", "licht"] } : m,
        ),
      });
      const v = checkProject(
        project({
          ...clean,
          "packages/core/src/pflege/y.ts":
            'import { l } from "../licht/index.ts";\nimport { k } from "../kern/index.ts";\nexport const z = [l, k];\n',
        }),
        c,
      );
      assert.ok(
        v.some((x) => /^AB-12 .*pflege imports every other module/.test(x)),
        v.join("\n"),
      );
      assert.ok(
        v.some((x) => /^AB-12 modules\.config\.mjs .*pflege may depend on every other/.test(x)),
      );
      const root = {
        "packages/core/src/index.ts":
          'export * from "./pflege";\nexport * from "./licht";\nexport * from "./kern";\nexport * from "./bestand";\n',
      };
      assert.deepEqual(run(root), []);
    });
  });

  describe("AB-13 register consistency", () => {
    it("a table with two owners fails", () => {
      const c = cfg({ MODULES: [CFG.MODULES[0], { ...CFG.MODULES[1], tables: ["konto"] }] });
      assert.ok(
        checkProject(project({}), c).some((x) =>
          /^AB-13 modules\.config\.mjs table konto has two owners/.test(x),
        ),
      );
    });
    it("a module registered twice fails", () => {
      const c = cfg({ MODULES: [CFG.MODULES[0], CFG.MODULES[0]] });
      assert.ok(checkProject(project({}), c).some((x) => /^AB-13 .*registered twice/.test(x)));
    });
    it("code in a folder that is neither a module nor in transition fails", () => {
      const v = run({
        "packages/core/src/wildwuchs/a.ts": "export const a = 1;\n",
        "packages/core/src/wildwuchs/index.ts": "export {};\n",
      });
      assert.match(v[0], /^AB-13 packages\/core\/src\/wildwuchs /);
    });
    it("a folder in the transition list is tolerated, a stale entry is an error", () => {
      const files = {
        "packages/core/src/alt/a.ts": "export const a = 1;\n",
        "packages/core/src/alt/index.ts": "export {};\n",
      };
      assert.deepEqual(run(files, cfg({ UNMODULED_FOLDERS: { "core/alt": "x" } })), []);
      const v = run({}, cfg({ UNMODULED_FOLDERS: { "core/alt": "x" } }));
      assert.match(v[0], /^AB-13 modules\.config\.mjs transition entry core\/alt is stale/);
    });
    it("a module folder in transition is not checked until the move", () => {
      const files = {
        "packages/web/src/licht/a.ts": "export const a = 1;\n",
        "packages/web/src/App.ts": 'import { a } from "./licht/a.ts";\nexport const b = a;\n',
      };
      assert.ok(run(files).some((x) => /^AB-7 /.test(x)));
      assert.deepEqual(run(files, cfg({ MODULE_FOLDERS_IN_TRANSITION: { "web/licht": "x" } })), []);
    });
    it("a migration or a table naming no owner fails", () => {
      const v = run({
        "packages/db/migrations/0005_licht_x.sql":
          "-- modul: licht\ncreate table waise (id int);\n",
      });
      assert.match(
        v[0],
        /^AB-13 packages\/db\/migrations\/0005_licht_x\.sql:2 table waise belongs to no module/,
      );
    });
  });

  describe("AB-14 migrations name their module", () => {
    const mig = (name, sql) => ({ [`packages/db/migrations/${name}`]: sql });
    it("a migration with module in name and first line, touching its own tables, passes", () => {
      assert.deepEqual(
        run(
          mig(
            "0005_licht_zone.sql",
            "-- modul: licht\ncreate table zone (id int);\nalter table konto add column x int;\n",
          ),
        ),
        [],
      );
    });
    it("a file name without a registered module fails", () => {
      const v = run(mig("0005_irgendwas.sql", "-- modul: licht\nselect 1;\n"));
      assert.match(v[0], /^AB-14 packages\/db\/migrations\/0005_irgendwas\.sql:1 /);
    });
    it("a missing or different first line fails", () => {
      assert.match(
        run(mig("0005_licht_zone.sql", "create table zone (id int);\n"))[0],
        /^AB-14 .*:1 first line must be "-- modul: licht"/,
      );
      assert.match(
        run(mig("0005_licht_zone.sql", "-- modul: bestand\nselect 1;\n"))[0],
        /^AB-14 .*found bestand/,
      );
    });
    it("changing a table of another module fails with the edge and the line", () => {
      const v = run(
        mig("0005_licht_zone.sql", "-- modul: licht\n\ncreate unique index i on topf (id);\n"),
      );
      assert.match(
        v[0],
        /^AB-14 packages\/db\/migrations\/0005_licht_zone\.sql:3 licht -> bestand: .*table topf/,
      );
    });
    it("comments do not count, policies and mandantenschutz() do", () => {
      assert.deepEqual(
        run(
          mig(
            "0005_licht_zone.sql",
            "-- modul: licht\n-- alter table topf add x int;\nselect 1;\n",
          ),
        ),
        [],
      );
      const v = run(
        mig("0005_licht_zone.sql", "-- modul: licht\nselect mandantenschutz('topf');\n"),
      );
      assert.match(v[0], /^AB-14 .*:2 licht -> bestand/);
    });
    it("legacy files are assigned by the register, a renamed one is an error", () => {
      const c = cfg({ LEGACY_MIGRATIONS: { "0001_alt.sql": ["kern", "licht"] } });
      assert.deepEqual(
        checkProject(
          project({ ...clean, ...mig("0001_alt.sql", "create table zone (id int);\n") }),
          c,
        ),
        [],
      );
      const v = checkProject(project({ ...clean, ...mig("0001_umbenannt.sql", "select 1;\n") }), c);
      assert.ok(
        v.some((x) =>
          /^AB-14 packages\/db\/migrations\/0001_alt\.sql .*renamed or removed/.test(x),
        ),
      );
    });
  });
});
