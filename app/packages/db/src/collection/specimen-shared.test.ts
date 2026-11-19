import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName, createFixtureSpecimen } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { specimenNamesOn } from "./specimen-shared.ts";
import { SpecimenPostgres } from "./specimens.ts";

// US-SOZ-11, P-04, P-08: the names and archived states of specimens, read as the caller (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup only (#294)
const [anna, ben] = [randomUUID(), randomUUID()];
const uid = () => randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await createAccountWithName(pool, anna, `N-${anna.slice(0, 4)}`);
  await createAccountWithName(pool, ben, `N-${ben.slice(0, 4)}`);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-11 the names and archived states of specimens (specimenNamesOn, P-04, P-08)", () => {
  it("US-SOZ-11 no ids answer an empty map without reading anything", async () => {
    const names = await withAccount(pool, anna, (c) => specimenNamesOn(c, []));
    expect(names.size).toBe(0);
  });

  it("US-SOZ-11 own specimens answer their name and whether they are archived; unknown and foreign ids are absent (P-04)", async () => {
    const active = `Aktiv ${uid()}`;
    const archived = `Archiv ${uid()}`;
    const activeId = await createFixtureSpecimen(pool, anna, active);
    const archivedId = await createFixtureSpecimen(pool, anna, archived);
    await new SpecimenPostgres(pool).archive(anna, archivedId, "Getauscht mit Ben", "2026-10-10");
    const foreignId = await createFixtureSpecimen(pool, ben, `Fremd ${uid()}`);
    const unknownId = randomUUID();
    const names = await withAccount(pool, anna, (c) =>
      specimenNamesOn(c, [activeId, archivedId, foreignId, unknownId]),
    );
    expect(names.get(activeId)).toEqual({ name: active, archived: false });
    expect(names.get(archivedId)).toEqual({ name: archived, archived: true });
    expect(names.has(foreignId)).toBe(false);
    expect(names.has(unknownId)).toBe(false);
  });
});
