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
const GLOBAL_REG: ModuleRegister = {
  KERNEL: "kernel",
  MODULES: [
    { name: "kernel", tables: ["account"], dependsOn: [] },
    { name: "catalog", tables: ["species", "other"], dependsOn: ["kernel"] },
    { name: "collection", tables: ["pot"], dependsOn: ["kernel", "catalog"] },
    { name: "care", tables: ["gabe"], dependsOn: ["kernel"] },
  ],
  GLOBAL_REFERENCE_TABLES: { species: { owner: "catalog", reason: "gemeinsamer Katalog" } },
};
const fk = (source: string, target: string, sourceColumns: string[], targetColumns: string[]) =>
  ({ name: `${source}_fk`, source, target, sourceColumns, targetColumns }) satisfies ForeignKey;
const simple = (source: string, target: string, remove = "r") =>
  ({ ...fk(source, target, ["species_id"], ["id"]), remove }) satisfies ForeignKey;
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

describe("AB-10 global reference tables (ADR 0003 O-2)", () => {
  const tables = ["pot", "species", "gabe", "other"];
  it("AB-10: a simple reference to (id) with on delete restrict from an allowed module is fine", () => {
    expect(moduleViolations(tables, [simple("pot", "species")], GLOBAL_REG)).toEqual([]);
  });
  it("AB-10: without an allowed dependency the reference to a global table fails too", () => {
    const v = moduleViolations(tables, [simple("gabe", "species")], GLOBAL_REG);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*care -> catalog: no allowed/)]);
  });
  it("AB-10: a table that is not registered does not get the exception", () => {
    const v = moduleViolations(tables, [simple("pot", "other")], GLOBAL_REG);
    expect(v).toEqual([
      expect.stringMatching(/^AB-10 .*collection -> catalog: .*\(account_id, id\)/),
    ]);
  });
  it("AB-10: without justification in the register the reference fails", () => {
    const reg = {
      ...GLOBAL_REG,
      GLOBAL_REFERENCE_TABLES: { species: { owner: "catalog", reason: "" } },
    };
    const v = moduleViolations(tables, [simple("pot", "species")], reg);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*without justification/)]);
  });
  it("AB-10: without on delete restrict the reference fails", () => {
    for (const rule of ["a", "c", "n"]) {
      const v = moduleViolations(tables, [simple("pot", "species", rule)], GLOBAL_REG);
      expect(v).toEqual([expect.stringMatching(/^AB-10 .*only with on delete restrict/)]);
    }
  });
  it("AB-10: a composite reference to the global table is not the allowed form", () => {
    const f = {
      ...fk("pot", "species", ["account_id", "species_id"], ["account_id", "id"]),
      remove: "r",
    };
    expect(moduleViolations(tables, [f], GLOBAL_REG)).toEqual([
      expect.stringMatching(/^AB-10 .*only as a simple reference to \(id\)/),
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
    GLOBAL_REFERENCE_TABLES: REAL.GLOBAL_REFERENCE_TABLES,
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

  it("AB-10: the real reference specimen.species_id -> species(id) is allowed as a global reference, without restrict it fails", async () => {
    expect(await findSchemaViolations(pool, withTestModules([]))).toEqual([]);
    const v = await inRollback(
      [
        "alter table specimen drop constraint specimen_species",
        "alter table specimen add constraint specimen_species foreign key (species_id) references species (id) on delete cascade",
      ],
      withTestModules([]),
    );
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*specimen -> species.*on delete restrict/)]);
  });

  it("AB-10: a register entry must be justified, concern a table without account ID with an exception and belong to the owner", async () => {
    const using = (g: NonNullable<ModuleRegister["GLOBAL_REFERENCE_TABLES"]>) => ({
      ...withTestModules([]),
      GLOBAL_REFERENCE_TABLES: g,
    });
    const species = { owner: "catalog", reason: "Katalog" };
    expect(
      await findSchemaViolations(pool, using({ species: { ...species, reason: " " } })),
    ).toEqual([
      expect.stringMatching(/^AB-10 global reference table species: without justification/),
      expect.stringMatching(/^AB-10 foreign key care_profile_species .*without justification/),
      expect.stringMatching(/^AB-10 foreign key specimen_species .*without justification/),
    ]);
    expect(
      await findSchemaViolations(pool, using({ specimen: { owner: "collection", reason: "x" } })),
    ).toEqual([
      expect.stringMatching(
        /^AB-10 global reference table specimen: only tables with a justified exception/,
      ),
      // `measurement` (care) references `specimen`; if `specimen` counts as a global reference table, that is a violation.
      expect.stringMatching(/^AB-10 foreign key care_profile_species/),
      expect.stringMatching(/^AB-10 foreign key measurement_specimen/),
      expect.stringMatching(/^AB-10 foreign key specimen_species/),
      expect.stringMatching(/^AB-10 foreign key treatment_specimen/),
    ]);
    expect(
      await findSchemaViolations(pool, using({ species: { ...species, owner: "light" } })),
    ).toEqual([
      expect.stringMatching(/^AB-10 global reference table species: owner light does not match/),
      expect.stringMatching(/^AB-10 foreign key care_profile_species/),
      expect.stringMatching(/^AB-10 foreign key specimen_species/),
    ]);
  });
});
