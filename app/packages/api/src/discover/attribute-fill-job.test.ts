import { randomUUID } from "node:crypto";
import { ATTRIBUTE_FILL_JOB_TYPE, runAttributeFill } from "@pflanzendex/core";
import {
  ReviewPostgres,
  TaxonAttributesPostgres,
  migrate,
  openFixturePool,
  openOwnerPool,
  withAccount,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attributeFillEnabled, attributeFillStore, checkAttributeFill } from "./index";

// US-ENT-09 part 2, P-08: the attribute fill on real PostgreSQL; it reads stored source answers and sends no request.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup and cleanup of shared rows (QG-D1)
const [account, operator, speciesId, plainId] = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
];
const genus = `Attrapi${randomUUID()
  .replace(/[^a-z]/g, "")
  .slice(0, 8)}`;
const latinName = `${genus} nanus`;
const plainName = `${genus} nihil`;
const FUTURE = () => new Date("2040-01-01T00:00:00Z");
const claims = (amount: string) => [
  {
    rank: "normal",
    mainsnak: {
      snaktype: "value",
      datavalue: {
        value: { amount, unit: "http://www.wikidata.org/entity/Q11573" },
      },
    },
  },
];

const addSpecies = async (id: string, epithet: string, name: string, raw: unknown) => {
  await admin.query(
    `insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')`,
    [account, id],
  );
  await admin.query(
    `insert into species (id, genus, epithet, latin_name, difficulty, standard_level, light_demand_lux,
       growth_measure, etiolation_signs, success_criteria, created_by)
     values ($1, $2, $3, $4, 1, 2, 100, 'height', 'v', 'e', 'user')`,
    [id, genus, epithet, name],
  );
  const v = await withAccount(pool, operator, (c) =>
    c.query<{ id: string }>("select id from review_case where object_id = $1", [id]),
  );
  await new ReviewPostgres(pool).decide(operator, v.rows[0]?.id ?? "", "reviewed", null);
  await admin.query(
    `insert into catalog_source_snapshot (species_id, source, source_id, retrieved_at, link, license, raw)
     values ($1, 'wikidata', 'Q99', '2026-10-18T23:30:00Z', 'https://www.wikidata.org/wiki/Q99', 'CC0-1.0', $2::jsonb)`,
    [id, JSON.stringify(raw)],
  );
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await admin.query("insert into account (id) values ($1), ($2)", [account, operator]);
  await admin.query("insert into account_role (account, role) values ($1, 'operator')", [operator]);
  await addSpecies(speciesId, "nanus", latinName, {
    entities: { Q99: { claims: { P2048: claims("+0.3") } } },
  });
  await addSpecies(plainId, "nihil", plainName, { entities: { Q99: { claims: {} } } });
});
afterAll(async () => {
  await admin.query("delete from job where type = $1", [ATTRIBUTE_FILL_JOB_TYPE]);
  await admin.query("delete from taxon_attribute where latin_name = any($1)", [
    [latinName, plainName],
  ]);
  await admin.query("delete from species where id = any($1)", [[speciesId, plainId]]);
  await admin.query("delete from review_case where object_id = any($1)", [[speciesId, plainId]]);
  await admin.query("delete from account where id = any($1)", [[account, operator]]);
  await pool.end();
  await admin.end();
});

describe("US-ENT-09 the switch of the attribute fill", () => {
  it("US-ENT-09 stays off without configuration and starts only with ATTRIBUTE_FILL=on", () => {
    expect(attributeFillEnabled({})).toBe(false);
    expect(attributeFillEnabled({ ATTRIBUTE_FILL: "" })).toBe(false);
    expect(attributeFillEnabled({ ATTRIBUTE_FILL: "off" })).toBe(false);
    expect(attributeFillEnabled({ ATTRIBUTE_FILL: "on" })).toBe(true);
  });

  it("US-ENT-09 P-10 a typo stops the start instead of reading as off", () => {
    expect(() => attributeFillEnabled({ ATTRIBUTE_FILL: "true" })).toThrow(/ATTRIBUTE_FILL/);
  });
});

describe("US-ENT-09 the attribute fill job on the database", () => {
  it("US-ENT-09 only a species with a height claim is a candidate and one check orders one job", async () => {
    const names = (await attributeFillStore(pool).heightCandidates()).map((c) => c.latinName);
    expect(names).toContain(latinName);
    expect(names).not.toContain(plainName);
    expect(await checkAttributeFill(pool, FUTURE)).toBe("queued");
    expect(await checkAttributeFill(pool, FUTURE)).toBe("queued");
    const open = await admin.query("select 1 from job where type = $1 and status = 'queued'", [
      ATTRIBUTE_FILL_JOB_TYPE,
    ]);
    expect(open.rowCount).toBe(1);
  });

  it("US-ENT-09 P-08 the run stores the growth size with source, link, license and date and leaves the rest unknown", async () => {
    const real = attributeFillStore(pool);
    // The shared test database may hold species of other tests: only this file's species is filled.
    const store = {
      heightCandidates: async () =>
        (await real.heightCandidates()).filter((c) => c.latinName.startsWith(genus)),
      save: real.save.bind(real),
    };
    expect(await runAttributeFill({ store })).toEqual({ stored: 1 });
    const stored = await new TaxonAttributesPostgres(pool).forSpecies([latinName, plainName]);
    expect(stored).toEqual([
      {
        species: latinName,
        field: "growthSize",
        value: "small",
        evidence: {
          source: "wikidata",
          url: "https://www.wikidata.org/wiki/Q99",
          license: "CC0-1.0",
          retrievedAt: "2026-10-18",
        },
      },
    ]);
    // Repeatable: nothing is left to fill, so a second run stores nothing and keeps one row (idempotent).
    expect(await runAttributeFill({ store })).toEqual({ stored: 0 });
    const rows = await admin.query("select 1 from taxon_attribute where latin_name = $1", [
      latinName,
    ]);
    expect(rows.rowCount).toBe(1);
  });
});
