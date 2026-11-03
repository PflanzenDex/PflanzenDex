import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { checkProject } from "../../check-boundaries.mjs";
import { MODULE_CONFIG as REAL } from "../../../../../config/lint/modules.config.mjs";

// Layer rules AB-3, AB-4 and AB-5 (FR-QG-05): a clean fixture and one violating fixture per kind of slip.
const mod = (name, dependsOn = ["kernel"]) => ({
  name,
  epics: [],
  tables: [],
  dependsOn,
  ports: [],
});
const CFG = {
  KERNEL: "kernel",
  MODULES: [
    mod("kernel", []),
    mod("ai"),
    mod("catalog"),
    mod("pokedex", ["kernel", "catalog"]),
    mod("social"),
    mod("swap"),
  ],
  LEGACY_MIGRATIONS: {},
  UNMODULED_FOLDERS: {},
  MODULE_FOLDERS_IN_TRANSITION: {},
};
const clean = {
  "packages/db/src/ai/index.ts": "export class DraftsPostgres {}\n",
  "packages/db/src/catalog/index.ts":
    "export class SpeciesPostgres {}\nexport class WishesPostgres {}\n",
  "packages/db/src/kernel/index.ts": "export class IdempotencyPostgres {}\n",
  "packages/api/src/ai/ai-routes.ts":
    'import { DraftsPostgres, SpeciesPostgres, IdempotencyPostgres } from "@pflanzendex/db";\nimport type { Pool } from "pg";\n' +
    "export function routes(pool: Pool) {\n  const drafts = new DraftsPostgres(pool);\n  const species = new SpeciesPostgres(pool);\n  drafts.save();\n  return run(species, new IdempotencyPostgres(pool));\n}\n",
  "packages/api/src/ai/mcp/tools.ts": 'export const q = (c) => c.req.query("x");\n',
  "packages/core/src/pokedex/taxonomy/run.ts":
    'import { x } from "../../kernel";\nimport { y } from "../types";\n',
  "packages/core/src/pokedex/types.ts": "export const y = 1;\n",
  "packages/core/src/kernel/index.ts": "export const x = 1;\n",
  "packages/db/src/pokedex/taxonomy.ts":
    'const INSERT = "insert into taxon (a) values ($1) on conflict (a) do update set a = 1";\nconst d = "delete from taxon";\n',
  "packages/api/src/pokedex/taxonomy-job.ts":
    'import { JobsPostgres, SpeciesPostgres } from "@pflanzendex/db";\nconst n = () => new SpeciesPostgres(pool).approvedLatinNames();\n',
  "packages/db/migrations/0030_social_sharing.sql":
    "-- module: social\ncreate function friend_shares(p_owner uuid) returns int as $$ $$;\n",
  "packages/db/src/social/sharing.ts": 'export const s = "select * from friend_shares($1)";\n',
  "packages/db/src/swap/handover.ts": 'export const r = "set local role pflanzendex_app";\n',
};

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layers-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const run = (patch) =>
  checkProject(project({ ...clean, ...patch }), CFG).filter((v) => /^AB-[345] /.test(v));

describe("layer rules AB-3, AB-4, AB-5 (FR-QG-05)", () => {
  it("FR-QG-05: a clean fixture has no AB-3, AB-4 or AB-5 violation", () =>
    assert.deepEqual(run({}), []));

  it("FR-QG-05 AB-3: a raw query on the pool in the AI layer", () => {
    const v = run({
      "packages/api/src/ai/x.ts": 'export const f = (pool) => pool.query("select 1");\n',
    });
    assert.match(v[0] ?? "", /^AB-3 packages\/api\/src\/ai\/x\.ts:1 .*pool\.query/);
  });
  it("FR-QG-05 AB-3: a value import of pg in the AI layer", () => {
    const v = run({
      "packages/api/src/ai/x.ts": 'import { Pool } from "pg";\nexport const p = Pool;\n',
    });
    assert.match(v[0] ?? "", /^AB-3 .*:1 value import of "pg"/);
  });
  it("FR-QG-05 AB-3: a method call on a repository of a foreign module", () => {
    const v = run({
      "packages/api/src/ai/x.ts":
        'import { SpeciesPostgres } from "@pflanzendex/db";\nconst s = new SpeciesPostgres(p);\nexport const f = () => s.insert({});\n',
    });
    assert.match(v[0] ?? "", /^AB-3 .*:3 s\.insert\(\) on SpeciesPostgres/);
  });
  it("FR-QG-05 AB-3: a method call straight on a new foreign repository", () => {
    const v = run({
      "packages/api/src/ai/x.ts":
        'import { WishesPostgres } from "@pflanzendex/db";\nexport const f = () => new WishesPostgres(p).list();\n',
    });
    assert.match(v[0] ?? "", /^AB-3 .*new WishesPostgres\(\.\.\.\)\.list\(\)/);
  });
  it("FR-QG-05 AB-3: an MCP tool imports the database package", () => {
    const v = run({
      "packages/api/src/ai/mcp/t.ts":
        'import { SpeciesPostgres } from "@pflanzendex/db";\nexport const t = SpeciesPostgres;\n',
    });
    assert.match(
      v[0] ?? "",
      /^AB-3 packages\/api\/src\/ai\/mcp\/t\.ts:1 the MCP tools call routes/,
    );
  });
  it("FR-QG-05 AB-3: the AI layer may call its own repositories and a test may use any", () => {
    assert.deepEqual(run({ "packages/api/src/ai/x.test.ts": "const r = pool.query('x');\n" }), []);
  });

  it("FR-QG-05 AB-4: the job code in core imports another module", () => {
    const v = run({
      "packages/core/src/pokedex/taxonomy/run.ts": 'import { w } from "../../catalog";\n',
      "packages/core/src/catalog/index.ts": "export const w = 1;\n",
    });
    assert.match(
      v[0] ?? "",
      /^AB-4 packages\/core\/src\/pokedex\/taxonomy\/run\.ts:1 pokedex -> catalog/,
    );
  });
  it("FR-QG-05 AB-4: the tree store writes a table other than taxon", () => {
    const v = run({
      "packages/db/src/pokedex/taxonomy.ts":
        'const a = "delete from taxon";\nconst b = "update specimen set a = 1";\n',
    });
    assert.equal(v.length, 1);
    assert.match(v[0], /^AB-4 packages\/db\/src\/pokedex\/taxonomy\.ts:2 .*update specimen/);
  });
  it("FR-QG-05 AB-4: the job wiring uses an adapter outside the build job", () => {
    const v = run({
      "packages/api/src/pokedex/taxonomy-job.ts":
        'import { WishesPostgres } from "@pflanzendex/db";\nexport const w = WishesPostgres;\n',
    });
    assert.match(v[0] ?? "", /^AB-4 .*taxonomy-job\.ts:1 adapter WishesPostgres/);
  });
  it("FR-QG-05 AB-4: the job calls a write on the catalog repository", () => {
    const v = run({
      "packages/api/src/pokedex/taxonomy-job.ts":
        'import { SpeciesPostgres } from "@pflanzendex/db";\nexport const w = () => new SpeciesPostgres(p).propose();\n',
    });
    assert.match(v[0] ?? "", /^AB-4 .*may only call approvedLatinNames/);
  });

  it("FR-QG-05 AB-5: a module other than the owner calls a friend function", () => {
    const v = run({
      "packages/db/src/swap/x.ts": 'export const q = "select * from friend_shares($1)";\n',
    });
    assert.match(
      v[0] ?? "",
      /^AB-5 packages\/db\/src\/swap\/x\.ts:1 swap -> social: friend_shares\(\)/,
    );
  });
  it("FR-QG-05 AB-5: the api calls a friend function itself", () => {
    const v = run({
      "packages/api/src/social/x.ts": 'export const q = "select * from friend_shares($1)";\n',
    });
    assert.match(v[0] ?? "", /^AB-5 packages\/api\/src\/social\/x\.ts:1 social -> social/);
  });
  it("FR-QG-05 AB-5: a social module reaches around the row rule", () => {
    for (const code of [
      "openOwnerPool()",
      "reset role",
      "set local role postgres",
      "row_security",
    ]) {
      const v = run({ "packages/db/src/swap/x.ts": `export const q = "${code}";\n` });
      assert.match(v[0] ?? "", /^AB-5 packages\/db\/src\/swap\/x\.ts:1 swap: /, code);
    }
  });
  it("FR-QG-05 AB-5: the owner adapter and the application role are fine", () =>
    assert.deepEqual(run({}), []));
});

describe("layer rules on the real project (FR-QG-05)", () => {
  it("FR-QG-05 AB-3 to AB-5: today's code has no violation", () => {
    const appDir = path.resolve(import.meta.dirname, "../../../../..");
    assert.deepEqual(
      checkProject(appDir, REAL).filter((v) => /^AB-[345] /.test(v)),
      [],
    );
  });
});
