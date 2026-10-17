import { randomUUID } from "node:crypto";
import { CATALOG_FILL_JOB_TYPE, runCatalogFill } from "@pflanzendex/core";
import type { SourceClient, SourceOutcome } from "@pflanzendex/core";
import {
  ReviewPostgres,
  migrate,
  openFixturePool,
  openOwnerPool,
  withAccount,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogFillEnabled, catalogFillStore, checkCatalogFill } from "./index";

// US-BES-12, FR-BES-18, P-08: the fill job against real PostgreSQL; the sources are a fake (no network).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup and cleanup of shared rows (QG-D1)
const [account, operator, speciesId] = [randomUUID(), randomUUID(), randomUUID()];
const genus = `Fillapi${randomUUID()
  .replace(/[^a-z]/g, "")
  .slice(0, 8)}`;
const latinName = `${genus} jobbi`;
const FUTURE = () => new Date("2040-01-01T00:00:00Z");
const T = "2026-10-18T10:00:00.000Z";
const found = (source: "gbif" | "wikipedia" | "wikidata", data: unknown): SourceOutcome => ({
  kind: "found",
  data,
  cached: false,
  provenance: { source, url: "https://example.test", retrievedAt: T },
});
const requests: string[] = [];
const sources: SourceClient = {
  async get(r) {
    requests.push(r.source);
    if (r.source === "gbif")
      return {
        ok: true,
        value: found("gbif", {
          usageKey: 7,
          matchType: "EXACT",
          rank: "SPECIES",
          family: "Testaceae",
        }),
      };
    if (r.source === "wikipedia")
      return {
        ok: true,
        value: found("wikipedia", {
          title: "Testpflanze",
          extract: "Die Testpflanze ist eine Pflanze. Sie wächst überall.",
          wikibase_item: "Q7",
          content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Testpflanze" } },
        }),
      };
    return {
      ok: true,
      value: found("wikidata", { entities: { Q7: { labels: { de: { value: "Testpflanze" } } } } }),
    };
  },
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await admin.query("insert into account (id) values ($1), ($2)", [account, operator]);
  await admin.query("insert into account_role (account, role) values ($1, 'operator')", [operator]);
  await admin.query(
    `insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')`,
    [account, speciesId],
  );
  await admin.query(
    `insert into species (id, genus, epithet, latin_name, difficulty, standard_level, light_demand_lux,
       growth_measure, etiolation_signs, success_criteria, created_by)
     values ($1, $2, 'jobbi', $3, 1, 2, 100, 'height', 'v', 'e', 'user')`,
    [speciesId, genus, latinName],
  );
});
afterAll(async () => {
  await admin.query("delete from job where type = $1", [CATALOG_FILL_JOB_TYPE]);
  await admin.query("delete from species where id = $1", [speciesId]);
  await admin.query("delete from review_case where object_id = $1", [speciesId]);
  await admin.query("delete from account where id = any($1)", [[account, operator]]);
  await pool.end();
  await admin.end();
});

describe("US-BES-12 P-08 the switch of the catalog fill", () => {
  it("US-BES-12 stays off without configuration and starts only with CATALOG_FILL=on", () => {
    expect(catalogFillEnabled({})).toBe(false);
    expect(catalogFillEnabled({ CATALOG_FILL: "" })).toBe(false);
    expect(catalogFillEnabled({ CATALOG_FILL: "off" })).toBe(false);
    expect(catalogFillEnabled({ CATALOG_FILL: "on" })).toBe(true);
  });

  it("US-BES-12 P-10 a typo stops the start instead of reading as off", () => {
    expect(() => catalogFillEnabled({ CATALOG_FILL: "yes" })).toThrow(/CATALOG_FILL/);
  });
});

describe("US-BES-12 the fill job on the database", () => {
  it("US-BES-12 orders one job only once the species is approved,  and a repeated check orders no second one for the approved one (first start)", async () => {
    // A proposal is not approved: it never counts as a gap.
    expect((await catalogFillStore(pool).candidates()).some((c) => c.id === speciesId)).toBe(false);
    const v = await withAccount(pool, operator, (c) =>
      c.query<{ id: string }>("select id from review_case where object_id = $1", [speciesId]),
    );
    await new ReviewPostgres(pool).decide(operator, v.rows[0]?.id ?? "", "reviewed", null);
    expect(await checkCatalogFill(pool, FUTURE)).toBe("queued");
    expect(await checkCatalogFill(pool, FUTURE)).toBe("queued");
    const open = await admin.query("select 1 from job where type = $1 and status = 'queued'", [
      CATALOG_FILL_JOB_TYPE,
    ]);
    expect(open.rowCount).toBe(1);
  });

  it("US-BES-12 FR-BES-18 the run fills the species with source and date and asks no keeper-triggered request", async () => {
    const real = catalogFillStore(pool);
    // The shared test database may hold approved species of other tests: only this file's species is filled.
    const store = {
      candidates: async () => (await real.candidates()).filter((c) => c.id === speciesId),
      record: real.record.bind(real),
    };
    expect(await runCatalogFill({ store, sources })).toEqual({ filled: 3 });
    const sp = await admin.query(
      "select family_latin, german_name, botanical_story, version from species where id = $1",
      [speciesId],
    );
    expect(sp.rows[0]).toMatchObject({
      family_latin: "Testaceae",
      german_name: "Testpflanze",
      version: 2,
    });
    const prov = await admin.query(
      "select field, source, license, version from catalog_field_provenance where species_id = $1 order by field",
      [speciesId],
    );
    expect(prov.rows).toEqual([
      { field: "botanical_story", source: "wikipedia", license: "CC-BY-SA-4.0", version: 2 },
      { field: "family_latin", source: "gbif", license: "CC0-1.0", version: 2 },
      { field: "german_name", source: "wikidata", license: "CC0-1.0", version: 2 },
    ]);
    // Second run: nothing left to ask for this species, so no further request leaves (repeatable, US-QS-03).
    const asked = requests.length;
    expect(await runCatalogFill({ store, sources })).toEqual({ filled: 0 });
    expect(requests.length).toBe(asked);
  });
});
