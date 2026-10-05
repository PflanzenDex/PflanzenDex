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
  KERNEL: "kernel",
  MODULES: [
    { name: "kernel", epics: [], tables: ["account"], dependsOn: [], ports: [] },
    { name: "light", epics: [], tables: ["zone"], dependsOn: ["kernel"], ports: [] },
    { name: "collection", epics: [], tables: ["pot"], dependsOn: ["kernel", "light"], ports: [] },
    { name: "care", epics: [], tables: ["gabe"], dependsOn: ["kernel", "collection"], ports: [] },
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
  [idx("kernel")]: "export const k = 1;\n",
  [idx("light")]: 'import { k } from "../kernel/index.ts";\nexport const l = k;\n',
  [idx("collection")]: 'import { l } from "../light";\nexport const b = l;\n',
  [idx("care")]: 'import { b } from "../collection/index.ts";\nexport const p = b;\n',
  "packages/core/src/index.ts": 'export * from "./care";\n',
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
        "packages/core/src/care/p.ts":
          'import { x } from "../collection/internal.ts";\nexport const y = x;\n',
        "packages/core/src/collection/internal.ts": "export const x = 1;\n",
      });
      assert.equal(v.length, 1);
      assert.match(v[0], /^AB-7 packages\/core\/src\/care\/p\.ts:1 care -> collection: /);
    });
    it("a root file (barrel, composition root) may not reach into a module either", () => {
      const v = run({ "packages/core/src/app.ts": 'export * from "./light/internal.ts";\n' });
      assert.match(v.join("\n"), /^AB-7 packages\/core\/src\/app\.ts:1 root -> light: /m);
    });
    it("a module folder without index.ts fails", () => {
      const files = Object.fromEntries(Object.entries(clean).filter(([k]) => k !== idx("light")));
      const v = checkProject(
        project({ ...files, "packages/core/src/light/z.ts": "export const z = 1;\n" }),
        CFG,
      );
      assert.ok(
        v.some((x) => /^AB-7 packages\/core\/src\/light\/index\.ts /.test(x)),
        v.join("\n"),
      );
    });
    it("test files and testhilfe.ts are exempt from AB-7, but not from the matrix", () => {
      const files = {
        "packages/core/src/collection/internal.ts": "export const x = 1;\n",
        "packages/core/src/collection/test-helpers.ts": "export const t = 1;\n",
        "packages/core/src/care/p.test.ts":
          'import { x } from "../collection/internal.ts";\nexport const y = x;\n',
        "packages/core/src/care/q.test.ts":
          'import { t } from "../collection/test-helpers";\nexport const y = t;\n',
      };
      assert.deepEqual(run(files), []);
      const v = run({
        ...files,
        "packages/core/src/light/l.test.ts":
          'import { x } from "../collection/internal.ts";\nexport const y = x;\n',
      });
      assert.ok(
        v.some((x) => /^AB-12 .*l\.test\.ts:1 light -> collection/.test(x)),
        v.join("\n"),
      );
      assert.ok(!v.some((x) => x.startsWith("AB-7")));
    });
    it("imports inside one module are free", () => {
      assert.deepEqual(
        run({
          "packages/core/src/light/z.ts": 'import { l } from "./index.ts";\nexport const z = l;\n',
        }),
        [],
      );
    });
  });

  describe("AB-8 dependency matrix and cycles", () => {
    it("an edge outside the matrix fails with rule, file, line and edge", () => {
      const v = run({
        "packages/core/src/light/x.ts":
          '\nimport { p } from "../care/index.ts";\nexport const q = p;\n',
      });
      assert.match(v[0], /^AB-8 packages\/core\/src\/light\/x\.ts:2 light -> care: /);
    });
    it("a cycle in the matrix fails", () => {
      const c = cfg({
        MODULES: [
          { ...CFG.MODULES[0] },
          { ...CFG.MODULES[1], dependsOn: ["kernel", "collection"] },
          { ...CFG.MODULES[2], dependsOn: ["kernel", "light"] },
          CFG.MODULES[3],
        ],
      });
      const v = checkProject(project(clean), c);
      assert.ok(
        v.some((x) => /^AB-8 modules\.config\.mjs cycle (light|collection) -> /.test(x)),
        v.join("\n"),
      );
    });
    it("a cycle through real imports fails (the matrix allows the edge in both directions)", () => {
      const c = cfg({
        MODULES: [
          CFG.MODULES[0],
          { ...CFG.MODULES[1], dependsOn: ["kernel", "care"] },
          CFG.MODULES[2],
          { ...CFG.MODULES[3], dependsOn: ["kernel", "collection", "light"] },
        ],
      });
      const v = checkProject(
        project({
          ...clean,
          "packages/core/src/light/x.ts":
            'import { p } from "../care/index.ts";\nexport const q = p;\n',
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
          { ...CFG.MODULES[1], dependsOn: ["kernel", "light", "gibtsnicht"] },
        ],
      });
      const v = checkProject(project({}), c);
      assert.ok(v.some((x) => /^AB-8 modules\.config\.mjs .*itself/.test(x)));
      assert.ok(v.some((x) => /^AB-13 modules\.config\.mjs .*unknown module gibtsnicht/.test(x)));
    });
  });

  describe("AB-9 SQL only on own tables", () => {
    const adapter = (sql) => ({
      "packages/db/src/care/index.ts": "export {};\n",
      "packages/db/src/care/gabe.ts": `\nexport const q = \`${sql}\`;\n`,
    });
    it("SQL on a table of another module fails with the edge", () => {
      const v = run(adapter("select * from gabe join pot on true"));
      assert.equal(v.length, 1);
      assert.match(
        v[0],
        /^AB-9 packages\/db\/src\/care\/gabe\.ts:2 care -> collection: .*table pot/,
      );
    });
    it("SQL on own tables and on the kernel is fine", () => {
      assert.deepEqual(run(adapter("select * from gabe join account on true")), []);
    });
  });

  describe("AB-11 the kernel imports no domain module", () => {
    it("kern importing a module fails", () => {
      const v = run({
        "packages/core/src/kernel/x.ts":
          'import { l } from "../light/index.ts";\nexport const q = l;\n',
      });
      assert.match(v[0], /^AB-11 packages\/core\/src\/kernel\/x\.ts:1 kernel -> light: /);
    });
    it("a kernel with dependencies in the register fails", () => {
      const c = cfg({
        MODULES: [{ ...CFG.MODULES[0], dependsOn: ["light"] }, ...CFG.MODULES.slice(1)],
      });
      assert.ok(
        checkProject(project(clean), c).some((x) => /^AB-11 modules\.config\.mjs /.test(x)),
      );
    });
    it("reports the number of kernel exports as a measure", () => {
      const dir = project({
        [idx("kernel")]:
          "export const a = 1;\nexport { b, c } from './x';\nexport type T = string;\n",
      });
      assert.equal(kernelExports({ appDir: dir, cfg: CFG, h: { stripComments: (s) => s } }), 4);
    });
  });

  describe("AB-12 only the root couples upwards or imports everything", () => {
    it("an import against an allowed edge (upwards) fails and points to a port", () => {
      const v = run({
        "packages/core/src/collection/x.ts":
          'import { p } from "../care/index.ts";\nexport const q = p;\n',
      });
      assert.match(
        v[0],
        /^AB-12 packages\/core\/src\/collection\/x\.ts:1 collection -> care: .*port/,
      );
    });
    it("a module importing every other module fails, the root may", () => {
      const c = cfg({
        MODULES: CFG.MODULES.map((m) =>
          m.name === "care" ? { ...m, dependsOn: ["kernel", "collection", "light"] } : m,
        ),
      });
      const v = checkProject(
        project({
          ...clean,
          "packages/core/src/care/y.ts":
            'import { l } from "../light/index.ts";\nimport { k } from "../kernel/index.ts";\nexport const z = [l, k];\n',
        }),
        c,
      );
      assert.ok(
        v.some((x) => /^AB-12 .*care imports every other module/.test(x)),
        v.join("\n"),
      );
      assert.ok(
        v.some((x) => /^AB-12 modules\.config\.mjs .*care may depend on every other/.test(x)),
      );
      const root = {
        "packages/core/src/index.ts":
          'export * from "./care";\nexport * from "./light";\nexport * from "./kernel";\nexport * from "./collection";\n',
      };
      assert.deepEqual(run(root), []);
    });
  });

  describe("AB-13 register consistency", () => {
    it("a table with two owners fails", () => {
      const c = cfg({ MODULES: [CFG.MODULES[0], { ...CFG.MODULES[1], tables: ["account"] }] });
      assert.ok(
        checkProject(project({}), c).some((x) =>
          /^AB-13 modules\.config\.mjs table account has two owners/.test(x),
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
    for (const f of ["components", "lib", "platform", "styles"])
      it(`QG-U4 · AB-13 the reserved design system folder web/${f} is no module candidate`, () => {
        assert.deepEqual(run({ [`packages/web/src/${f}/x.ts`]: "export const x = 1;\n" }), []);
      });
    it("QG-U4 · AB-13 a reserved design system folder name under core or api still fails", () => {
      for (const pkg of ["core", "api"]) {
        const v = run({ [`packages/${pkg}/src/platform/x.ts`]: "export const x = 1;\n" });
        assert.ok(v.some((x) => x.startsWith(`AB-13 packages/${pkg}/src/platform `)));
      }
    });
    it("QG-U4 · AB-13 an unknown web folder still fails", () => {
      const v = run({ "packages/web/src/foo/x.ts": "export const x = 1;\n" });
      assert.match(v[0], /^AB-13 packages\/web\/src\/foo /);
    });
    it("a module folder in transition is not checked until the move", () => {
      const files = {
        "packages/web/src/light/a.ts": "export const a = 1;\n",
        "packages/web/src/App.ts": 'import { a } from "./light/a.ts";\nexport const b = a;\n',
      };
      assert.ok(run(files).some((x) => /^AB-7 /.test(x)));
      assert.deepEqual(run(files, cfg({ MODULE_FOLDERS_IN_TRANSITION: { "web/light": "x" } })), []);
    });
    it("a migration or a table naming no owner fails", () => {
      const v = run({
        "packages/db/migrations/0005_light_x.sql":
          "-- module: light\ncreate table waise (id int);\n",
      });
      assert.match(
        v[0],
        /^AB-13 packages\/db\/migrations\/0005_light_x\.sql:2 table waise belongs to no module/,
      );
    });
  });

  describe("AB-10 foreign keys to global reference tables (ADR 0003 O-2)", () => {
    const GLOBAL = { species: { owner: "catalog", reason: "shared catalog without account_id" } };
    const withCatalog = (global = GLOBAL) =>
      cfg({
        MODULES: [
          ...CFG.MODULES.map((m) =>
            m.name === "collection" ? { ...m, dependsOn: [...m.dependsOn, "catalog"] } : m,
          ),
          { name: "catalog", epics: [], tables: ["species"], dependsOn: ["kernel"], ports: [] },
        ],
        GLOBAL_REFERENCE_TABLES: global,
      });
    const mig = (module, sql, name = `0005_${module}_x.sql`) => ({
      [`packages/db/migrations/${name}`]: `-- module: ${module}\n${sql}`,
    });
    const FK =
      "alter table pot add foreign key (species_id) references species (id) on delete restrict;\n";
    const catalogIdx = { [idx("catalog")]: "export const a = 1;\n" };
    const go = (files, c = withCatalog()) => run({ ...catalogIdx, ...files }, c);

    it("AB-10: a plain (id) foreign key with on delete restrict from an allowed module passes", () => {
      assert.deepEqual(go(mig("collection", FK)), []);
      assert.deepEqual(
        go(
          mig(
            "collection",
            "create table pot (species_id uuid references species(id) on delete restrict);\n",
          ),
        ),
        [],
      );
    });
    it("AB-10: a dependency that the matrix does not allow fails with the edge", () => {
      const v = go(mig("care", FK.replace("pot", "gabe")));
      assert.match(
        v.join("\n"),
        /^AB-10 .*0005_care_x\.sql:2 care -> catalog: .*without an allowed dependency/m,
      );
    });
    it("AB-10: a table that is not registered as global is not covered by the exception", () => {
      const v = go(mig("collection", FK), withCatalog({}));
      assert.deepEqual(v, []); // the text gate leaves it to the schema check (module-schema.ts: plain (id) fails there)
      assert.deepEqual(
        checkProject(
          project({ ...clean, ...catalogIdx }),
          withCatalog({ pot: GLOBAL.species }),
        ).filter((x) => /owner catalog does not own/.test(x)).length,
        1,
      );
    });
    it("AB-10: an entry without a reason is an error", () => {
      const v = go({}, withCatalog({ species: { owner: "catalog", reason: " " } }));
      assert.match(
        v.join("\n"),
        /^AB-10 modules\.config\.mjs global reference table species has no reason/m,
      );
      const w = go(
        mig("collection", FK),
        withCatalog({ species: { owner: "catalog", reason: "" } }),
      );
      assert.match(w.join("\n"), /:2 foreign key to global reference table species has no reason/);
    });
    it("AB-10: a missing on delete restrict fails", () => {
      const v = go(mig("collection", FK.replace(" on delete restrict", "")));
      assert.match(v.join("\n"), /^AB-10 .*:2 collection -> catalog: .*needs on delete restrict/m);
      const c = go(mig("collection", FK.replace("restrict", "cascade")));
      assert.match(c.join("\n"), /needs on delete restrict/);
    });
    it("AB-10: a composite or non-id target fails", () => {
      const v = go(mig("collection", FK.replace("(id)", "(account_id, id)")));
      assert.match(v.join("\n"), /only as a plain \(id\) target/);
    });
  });

  describe("AB-14 migrations name their module", () => {
    const mig = (name, sql) => ({ [`packages/db/migrations/${name}`]: sql });
    it("a migration with module in name and first line, touching its own tables, passes", () => {
      assert.deepEqual(
        run(
          mig(
            "0005_light_zone.sql",
            "-- module: light\ncreate table zone (id int);\nalter table account add column x int;\n",
          ),
        ),
        [],
      );
    });
    it("a file name without a registered module fails", () => {
      const v = run(mig("0005_irgendwas.sql", "-- module: light\nselect 1;\n"));
      assert.match(v[0], /^AB-14 packages\/db\/migrations\/0005_irgendwas\.sql:1 /);
    });
    it("a missing or different first line fails", () => {
      assert.match(
        run(mig("0005_light_zone.sql", "create table zone (id int);\n"))[0],
        /^AB-14 .*:1 first line must be "-- module: light"/,
      );
      assert.match(
        run(mig("0005_light_zone.sql", "-- module: collection\nselect 1;\n"))[0],
        /^AB-14 .*found collection/,
      );
    });
    it("changing a table of another module fails with the edge and the line", () => {
      const v = run(
        mig("0005_light_zone.sql", "-- module: light\n\ncreate unique index i on pot (id);\n"),
      );
      assert.match(
        v[0],
        /^AB-14 packages\/db\/migrations\/0005_light_zone\.sql:3 light -> collection: .*table pot/,
      );
    });
    it("comments do not count, policies and mandantenschutz() do", () => {
      assert.deepEqual(
        run(
          mig(
            "0005_light_zone.sql",
            "-- module: light\n-- alter table pot add x int;\nselect 1;\n",
          ),
        ),
        [],
      );
      const v = run(
        mig("0005_light_zone.sql", "-- module: light\nselect tenant_protection('pot');\n"),
      );
      assert.match(v[0], /^AB-14 .*:2 light -> collection/);
    });
    it("legacy files are assigned by the register, a renamed one is an error", () => {
      const c = cfg({ LEGACY_MIGRATIONS: { "0001_alt.sql": ["kernel", "light"] } });
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

describe("AB-11 glossary words in the kernel (FR-QG-19)", () => {
  const words = cfg({ KERNEL_GLOSSARY_WORDS: ["specimen", "species", "wish"] });
  const kernel = (src) => ({ "packages/core/src/kernel/domain.ts": src });

  it("an identifier with a glossary word fails with rule, file, line and the word", () => {
    const v = run(kernel("export const a = 1;\nexport function loadSpecimens() {}\n"), words);
    assert.equal(v.length, 1);
    assert.match(
      v[0],
      /^AB-11 packages\/core\/src\/kernel\/domain\.ts:2 kernel names the glossary word "specimens" in `loadSpecimens`/,
    );
  });

  it("snake case and plurals are matched", () => {
    assert.equal(run(kernel("export const wish_list_size = 1;\n"), words).length, 1);
    assert.equal(run(kernel("export const allSpecies = 1;\n"), words).length, 1);
  });

  it("comments and string literals (error codes, texts) are data and pass", () => {
    const src =
      '// the specimen\n/* species */\nexport const codes = { "species.not_found": 404, t: `wish` };\n';
    assert.deepEqual(run(kernel(src), words), []);
  });

  it("test files and test helpers of the kernel are not checked", () => {
    const files = {
      "packages/core/src/kernel/a.test.ts": "export const specimen = 1;\n",
      "packages/core/src/kernel/test-helpers.ts": "export const wish = 1;\n",
    };
    assert.deepEqual(run(files, words), []);
  });

  it("without a word list the rule is idle", () => {
    assert.deepEqual(run(kernel("export const specimen = 1;\n")), []);
  });
});

describe("AB-13 contract test per port (FR-QG-19)", () => {
  const withPort = cfg({
    MODULES: CFG.MODULES.map((m) => (m.name === "light" ? { ...m, ports: ["ZoneUsage"] } : m)),
  });
  const declared = {
    "packages/core/src/light/types.ts": "export interface ZoneUsage { user(): void }\n",
  };
  const contract = {
    "packages/core/src/light/zone-usage.contract.test.ts":
      'describe("ZoneUsage contract", () => {});\n',
  };

  it("a declared port without a contract test fails and names the port and module", () => {
    const v = run(declared, withPort);
    assert.equal(v.length, 1);
    assert.match(v[0], /^AB-13 modules\.config\.mjs port ZoneUsage \(light\) has no contract test/);
  });

  it("a declared port with a contract test passes", () => {
    assert.deepEqual(run({ ...declared, ...contract }, withPort), []);
  });

  it("a contract test of the implementing module counts for a port of another module", () => {
    const other = {
      "packages/core/src/care/zone-usage.contract.test.ts":
        'describe("ZoneUsage contract", () => {});\n',
    };
    assert.deepEqual(run({ ...declared, ...other }, withPort), []);
  });

  it("a test that is not named *.contract.test does not count", () => {
    const other = { "packages/core/src/light/zone-usage.test.ts": "// ZoneUsage\n" };
    assert.equal(run({ ...declared, ...other }, withPort).length, 1);
  });

  it("a registered port that is not declared in code yet is not checked", () => {
    assert.deepEqual(run({}, withPort), []);
  });

  it("a registered exemption passes, and goes stale once a contract test exists", () => {
    const exempt = cfg({
      ...withPort,
      PORTS_WITHOUT_CONTRACT_TEST: { ZoneUsage: "needs the database" },
    });
    assert.deepEqual(run(declared, exempt), []);
    const v = run({ ...declared, ...contract }, exempt);
    assert.equal(v.length, 1);
    assert.match(v[0], /PORTS_WITHOUT_CONTRACT_TEST entry ZoneUsage is stale/);
  });

  it("the real register: every declared port has a contract test or a reasoned exemption", () => {
    const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    assert.deepEqual(
      checkProject(appDir, REAL).filter((v) => /^AB-1[13] /.test(v)),
      [],
    );
    for (const reason of Object.values(REAL.PORTS_WITHOUT_CONTRACT_TEST))
      assert.ok(reason.trim().length > 0);
  });
});
