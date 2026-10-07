import { randomUUID } from "node:crypto";
import { TAXONOMY_JOB_TYPE } from "@pflanzendex/core";
import type { JobRow, SourceClient, SourceOutcome } from "@pflanzendex/core";
import {
  ReviewPostgres,
  migrate,
  openFixturePool,
  openOwnerPool,
  withAccount,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { checkTaxonomy, pokedexJobHandlers, scheduleChecks } from "./index";

// US-POK-03: the build job against real PostgreSQL; the sources are a fake (no network, no clock).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup and cleanup of shared rows (QG-D1)
const account = randomUUID();
const operator = randomUUID();
const speciesId = randomUUID();
// Unique per run: the shared test database may hold species of other tests.
const genus = `Taxonus${randomUUID()
  .replace(/[^a-z]/g, "")
  .slice(0, 8)}`;
const latinName = `${genus} jobbi`;
// Far in the future: the jobs of other test files (clock 2030) never pick the order up.
const FUTURE = () => new Date("2040-01-01T00:00:00Z");
const T = "2026-10-06T10:00:00.000Z";

const found = (
  source: "opentree" | "wikipedia" | "wikidata" | "gbif",
  data: unknown,
): SourceOutcome => ({
  kind: "found",
  data,
  cached: false,
  provenance: { source, url: `https://example.test/${source}`, retrievedAt: T },
});
const sources: SourceClient = {
  async get(r) {
    if (r.path === "/tnrs/match_names")
      return {
        ok: true,
        value: found("opentree", {
          results: [
            {
              name: latinName,
              matches: [
                {
                  is_synonym: false,
                  is_approximate_match: false,
                  taxon: { ott_id: 9, unique_name: latinName, rank: "species" },
                },
              ],
            },
          ],
        }),
      };
    if (r.path === "/taxonomy/taxon_info")
      return {
        ok: true,
        value: found("opentree", {
          lineage: [
            { rank: "genus", name: genus },
            { rank: "family", name: "Testaceae" },
          ],
        }),
      };
    // No Wikipedia article and no GBIF hit: both stay unknown (P-08).
    const missing: SourceOutcome = {
      kind: "not_found",
      cached: false,
      provenance: { source: r.source, url: "u", retrievedAt: T },
    };
    return { ok: true, value: missing };
  },
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await admin.query("insert into account (id) values ($1)", [account]);
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
  // The operator approves the proposal through the real review path (TE-08).
  await admin.query("insert into account (id) values ($1)", [operator]);
  await admin.query("insert into account_role (account, role) values ($1, 'operator')", [operator]);
  const v = await withAccount(pool, operator, (c) =>
    c.query<{ id: string }>("select id from review_case where object_id = $1", [speciesId]),
  );
  await new ReviewPostgres(pool).decide(operator, v.rows[0]?.id ?? "", "reviewed", null);
});
afterAll(async () => {
  await admin.query("delete from job where type = $1", [TAXONOMY_JOB_TYPE]);
  await admin.query("delete from taxon where latin_name = $1", [latinName]);
  await admin.query("delete from species where id = $1", [speciesId]);
  await admin.query("delete from review_case where object_id = $1", [speciesId]);
  await admin.query("delete from account where id = any($1)", [[account, operator]]);
  await pool.end();
  await admin.end();
});

const job = { type: TAXONOMY_JOB_TYPE } as JobRow;

describe("US-POK-03 taxonomy build job", () => {
  it("US-POK-03 queues one build for a changed catalog, then builds the tree and queues nothing more", async () => {
    expect(await checkTaxonomy(pool, FUTURE)).toBe("queued");
    expect(await checkTaxonomy(pool, FUTURE)).toBe("queued");
    const open = await admin.query("select 1 from job where type = $1 and status = 'queued'", [
      TAXONOMY_JOB_TYPE,
    ]);
    expect(open.rowCount).toBe(1);

    const handler = pokedexJobHandlers({ pool, sources })[TAXONOMY_JOB_TYPE];
    await handler?.(job, new Date(T));
    const row = await admin.query("select * from taxon where latin_name = $1", [latinName]);
    expect(row.rows[0]).toMatchObject({
      status: "resolved",
      genus,
      family: "Testaceae",
      order_name: null,
      summary: null,
      genus_species_count: null,
    });
    expect(row.rows[0].provenance).toMatchObject({ lineage: { source: "opentree" } });
    expect(await checkTaxonomy(pool, FUTURE)).toBe("up_to_date");
  });

  it("US-POK-01 serves the built tree as collector cards: missing for one account, caught for the account with a specimen", async () => {
    const reviewer = async (token: string) =>
      token.startsWith("valid:")
        ? { sub: token.slice(6), email: "x@example.test", name: "T", email_verified: true }
        : null;
    const app = createApp({ reviewer, pool });
    const get = async (sub: string | null, query = "timeZone=Europe%2FBerlin") =>
      app.request(`/pokedex/cards?${query}`, {
        headers: sub ? { authorization: `Bearer valid:${sub}` } : {},
      });
    const mine = async (sub: string) => {
      const body = (await (await get(sub)).json()) as {
        cards: { species: string; state: string }[];
      };
      return body.cards.find((c) => c.species === latinName);
    };
    expect((await get(null)).status).toBe(401);
    const bad = await get(`pok1-${account}`, "timeZone=Mars%2FBase");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("input.invalid");

    const keeper = `pok1-keeper-${account}`;
    const other = `pok1-other-${account}`;
    expect(await mine(keeper)).toMatchObject({
      state: "missing",
      genus,
      family: "Testaceae",
      difficulty: 1,
      lightZone: 2,
      germanName: null,
    });
    const made = await app.request("/specimens", {
      method: "POST",
      headers: {
        authorization: `Bearer valid:${keeper}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ timeZone: "Europe/Berlin", speciesId, marker: "Karte" }),
    });
    expect(made.status).toBe(201);
    expect(await mine(keeper)).toMatchObject({ state: "caught", specimenCount: 1 });
    expect(await mine(other)).toMatchObject({ state: "missing", specimenCount: 0 });
    await admin.query(
      "delete from specimen where account_id in (select id from account where subject = any($1))",
      [[keeper, other]],
    );
    await admin.query("delete from account where subject = any($1)", [[keeper, other]]);
  });

  it("US-POK-03 the job type is registered, so a queued build never ends dead for lack of a handler", () => {
    expect(Object.keys(pokedexJobHandlers({ pool, sources }))).toEqual([TAXONOMY_JOB_TYPE]);
  });

  it("US-POK-03 the schedule checks at once and then every interval, and reports a failed check (P-10)", async () => {
    vi.useFakeTimers();
    try {
      const reported: unknown[] = [];
      let calls = 0;
      const stop = scheduleChecks(
        async () => {
          calls += 1;
          if (calls === 2) throw new Error("db down");
        },
        1000,
        (e) => reported.push(e),
      );
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(calls).toBe(3);
      expect(reported).toHaveLength(1);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
