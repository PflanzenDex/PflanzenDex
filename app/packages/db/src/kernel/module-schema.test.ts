import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULE_CONFIG as REAL } from "../../../../modules.config.mjs";
import { findSchemaViolations, migrate } from "./index.ts";
import { moduleViolations, type ForeignKey, type ModuleRegister } from "./module-schema.ts";
import { openPool } from "./connection.ts";

// Module boundaries in the schema (FR-QG-19): table ownership (AB-13) and foreign keys across module boundaries (AB-10).
const REGISTER: ModuleRegister = {
  KERNEL: "kernel",
  MODULES: [
    { name: "kernel", tables: ["account"], dependsOn: [] },
    { name: "light", tables: ["zone"], dependsOn: ["kernel"] },
    { name: "collection", tables: ["pot"], dependsOn: ["kernel", "light"] },
    { name: "care", tables: ["gabe"], dependsOn: ["kernel", "collection"] },
  ],
};
const fk = (source: string, target: string, sourceColumns: string[], targetColumns: string[]) =>
  ({ name: `${source}_fk`, source, target, sourceColumns, targetColumns }) satisfies ForeignKey;
const safe = (source: string, target: string) =>
  fk(source, target, ["account_id", "x_id"], ["account_id", "id"]);

describe("module boundaries in the schema (FR-QG-19)", () => {
  it("AB-13: a table without a module stands out", () => {
    const v = moduleViolations(["account", "waise"], [], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-13 table waise:/)]);
  });

  it("AB-10: foreign keys within a module and to the tenant anchor are free", () => {
    const anchor = fk("zone", "account", ["account_id"], ["id"]);
    const internal = fk("zone", "zone", ["a"], ["id"]);
    expect(moduleViolations(["zone"], [anchor, internal], REGISTER)).toEqual([]);
  });

  it("AB-10: tenant-safe to an allowed dependency is fine", () => {
    expect(moduleViolations(["pot", "zone"], [safe("pot", "zone")], REGISTER)).toEqual([]);
  });

  it("AB-10: without an allowed dependency the foreign key fails and names the edge", () => {
    const v = moduleViolations(["gabe", "zone"], [safe("gabe", "zone")], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*care -> light: no allowed/)]);
  });

  it("AB-10: the opposite direction (upwards) is also forbidden without an edge", () => {
    const v = moduleViolations(["zone", "pot"], [safe("zone", "pot")], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*light -> collection/)]);
  });

  it("AB-10: across module boundaries only as (account_id, id), not to the plain id", () => {
    const simple = fk("pot", "zone", ["zone_id"], ["id"]);
    const v = moduleViolations(["pot", "zone"], [simple], REGISTER);
    expect(v).toEqual([
      expect.stringMatching(/^AB-10 .*collection -> light: .*\(account_id, id\)/),
    ]);
  });
});

describe("module boundaries against the real database (AB-10, AB-13)", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = openPool();
    await migrate(pool);
  });
  afterAll(() => pool.end());

  const withTestModules = (dependent: string[]): ModuleRegister => ({
    KERNEL: REAL.KERNEL,
    MODULES: [
      ...REAL.MODULES.map((m) => ({ ...m })),
      { name: "ta", tables: ["zone_t"], dependsOn: ["kernel"] },
      { name: "tb", tables: ["pot_t"], dependsOn: ["kernel", ...dependent] },
    ],
  });
  const zone =
    "create table zone_t (account_id uuid not null references account(id), id uuid, unique (account_id, id))";

  async function inRollback(sql: string[], register: ModuleRegister) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const s of sql) await client.query(s);
      return await findSchemaViolations(client, register);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }
  const pot = (foreign: string) => [
    zone,
    "select tenant_protection('zone_t')",
    `create table pot_t (account_id uuid not null references account(id), zone_id uuid, ${foreign})`,
    "select tenant_protection('pot_t')",
  ];

  it("AB-13: a table without an entry in the register stands out in the real database", async () => {
    const v = await inRollback(
      [
        "create table waise_t (account_id uuid not null references account(id))",
        "select tenant_protection('waise_t')",
      ],
      withTestModules([]),
    );
    expect(v).toEqual([expect.stringMatching(/^AB-13 table waise_t:/)]);
  });

  it("AB-10: a foreign key without an allowed dependency fails", async () => {
    const sql = pot("foreign key (account_id, zone_id) references zone_t (account_id, id)");
    const v = await inRollback(sql, withTestModules([]));
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*tb -> ta: no allowed/)]);
  });

  it("AB-10: a plain foreign key to an allowed dependency fails, the tenant-safe one does not", async () => {
    const simple = pot("foreign key (zone_id) references zone_t (id)").map((s) =>
      s === zone
        ? zone.replace("unique (account_id, id)", "unique (id), unique (account_id, id)")
        : s,
    );
    const v = await inRollback(simple, withTestModules(["ta"]));
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*tb -> ta: .*\(account_id, id\)/)]);
    const ok = pot("foreign key (account_id, zone_id) references zone_t (account_id, id)");
    expect(await inRollback(ok, withTestModules(["ta"]))).toEqual([]);
  });
});
