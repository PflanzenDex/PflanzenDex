import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { holdTaxonLock, migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp } from "./app";
import { countingPool, type CountingPool } from "./count-queries";
import { apiFor, type Api } from "./query-count-api-test-helpers";
import { getRoutes, MEASURED, requestPath } from "./query-count-endpoints";
import { befriend, friendName, seedFriend } from "./query-count-seed-social-test-helpers";
import { TZ, type SeedIds } from "./query-count-seed-test-helpers";
import { seedSize, taxonName, type Cast } from "./query-count-seed-size-test-helpers";
import { growthReport, normalize, repeatFindings } from "./query-count-statements";

// US-QG-07: the number of SQL statements of a request must not grow with the keeper's data (N+1), and one request must
// not send the same statement text twice (duplicate read). Every GET route of the app is measured or listed in EXCLUDED
// with a reason, so a new route fails until it is covered. Findings that exist today are in the two baselines, which
// only shrink: `query-count-baseline.json` (growth) and `query-repeat-baseline.json` (repeated statement texts).
const SMALL = 5;
const LARGE = 50;
const ALLOWED_GROWTH = 0; // statements; any growth with the data is an N+1 (starting value, assumption)
const SIZES = ["small", "large"] as const;
type Size = (typeof SIZES)[number];

/** GET routes the gate does not call, with the reason. A route is listed only when it cannot answer 200 for a keeper. */
const EXCLUDED: Record<string, string> = {
  "/health": "public health check: no sign-in and no account data",
  "/health/details": "public health check with the build details: no sign-in and no account data",
  "/operator/introduction": "operator role: keepers have none; the operator area has its own tests",
  "/operator/overview": "operator role: keepers have none; the operator area has its own tests",
  "/review":
    "reviewer role; the open list is installation-wide, so its rows depend on parallel test files",
  "/catalog/corrections":
    "reviewer role; the open correction list is installation-wide (as /review)",
  "/catalog/gaps": "reviewer role; the gap list reads the installation-wide catalog (as /review)",
  "/specimens/:id/measurements/:measurementId/photo":
    "photo download: 502 without the media store of the app",
  "/wishes/:id/image": "image download: 502 without the wish image sources of the app",
};

type Measured = { status: number; count: number; statements: readonly string[]; body: string };

// The growth reasons name their audit issue (none is left: every measured route is flat with the data). The repeated
// texts have no reason field, so they are grouped here: offers, exchange and swaps #1237; the specimen and species rows
// of each friend, read once per friend and not per row #1238; achievements #1239; account data, friend shares and the
// sign-in guard read twice #1240; care profiles, locations and light zones #1243.
const readBaseline = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")) as T;
const growthBaseline = readBaseline<Record<string, string>>("query-count-baseline.json");
const repeatBaseline = readBaseline<Record<string, string[]>>("query-repeat-baseline.json");
const measured = Object.keys(MEASURED);
// The friends of the NFR-12 friend-view block, cleaned up with the other accounts (see `afterAll`).
const friendViewSubs: string[] = [];

const cast = (tag: string): Cast => ({
  tag,
  keeper: `qc-k-${randomUUID()}`,
  friendA: `qc-a-${randomUUID()}`,
  friendB: `qc-b-${randomUUID()}`,
  reviewer: `qc-r-${randomUUID()}`,
});
const casts: Record<Size, Cast> = { small: cast("s"), large: cast("l") };
const ids: Partial<Record<Size, SeedIds>> = {};
const results: Record<Size, Record<string, Measured>> = { small: {}, large: {} };
const run = randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 10);

let admin: Pool;
let pool: Pool;
let counter: CountingPool;
let api: Api;
let app: Hono;
let routes: string[] = [];
// Seeds taxa and compares two measurements of the Pokedex endpoints: a parallel taxonomy build (exclusive holder of the
// taxon lock) must not replace the `taxon` table in between (US-QG-01, #994).
let releaseTaxa: (() => Promise<void>) | undefined;

/** A few resolved catalog taxa (shared table), so the Pokedex and wish endpoints have rows to derive. */
async function seedTaxa(): Promise<void> {
  for (let g = 0; g < 5; g++)
    await admin.query(
      `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
       values ($1, 'resolved', $1, $2, 'Qcfamily', $3, now())`,
      [taxonName(run, g), `Qcgenus${run}${g}`, `qc-${run}`],
    );
}

/** Calls every measured route twice for one size (the first call fills caches and creates rows) and keeps the second. */
async function measure(size: Size, seeded: SeedIds): Promise<void> {
  for (const pattern of measured) {
    const path = requestPath(pattern, seeded);
    await api.call(casts[size].keeper, "GET", path);
    counter.reset();
    const r = await api.call(casts[size].keeper, "GET", path);
    results[size][`GET ${pattern}`] = {
      status: r.status,
      count: counter.count(),
      statements: counter.statements(),
      body: JSON.stringify(r.body).slice(0, 200),
    };
  }
}

beforeAll(async () => {
  admin = openFixturePool();
  releaseTaxa = await holdTaxonLock(admin);
  const owner = openOwnerPool();
  await migrate(owner);
  counter = countingPool(owner);
  pool = counter.pool;
  const verifier = async (token: string) =>
    token.startsWith("valid:")
      ? {
          sub: token.slice(6),
          email: `${token.slice(6)}@example.test`,
          name: "T",
          email_verified: true,
        }
      : null;
  app = createApp({ reviewer: verifier, pool });
  api = apiFor(app);
  routes = getRoutes(app);
  await seedTaxa();
  ids.small = await seedSize({ api, admin, run }, casts.small, SMALL);
  ids.large = await seedSize({ api, admin, run }, casts.large, LARGE);
  for (const size of SIZES) await measure(size, ids[size] as SeedIds);
}, 280_000);

afterAll(async () => {
  const subs = [...SIZES.flatMap((size) => Object.values(casts[size])), ...friendViewSubs];
  // Offers reference their specimen without a cascade: they go first.
  await admin.query(
    "delete from offer where account_id in (select id from account where subject = any($1))",
    [subs],
  );
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [subs],
  );
  // Care profiles hold their species with `on delete restrict`: they go before the species.
  await admin.query(
    "delete from care_profile where account_id in (select id from account where subject = any($1))",
    [subs],
  );
  await admin.query(
    "delete from account_role where account in (select id from account where subject = any($1))",
    [subs],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [subs],
  );
  await admin.query("delete from account where subject = any($1)", [subs]);
  await admin.query("delete from taxon where catalog_fingerprint = $1", [`qc-${run}`]);
  await pool.end();
  await releaseTaxa?.();
  await admin.end();
});

describe("US-QG-07 statements per request do not grow with the data (N+1)", () => {
  it("US-QG-07 every GET route of the app is measured or excluded with a reason", () => {
    const unlisted = routes.filter((r) => !(r in MEASURED) && !(r in EXCLUDED));
    expect(
      unlisted,
      "list each route in MEASURED (endpoints.ts) or EXCLUDED with a reason",
    ).toEqual([]);
    const stale = [...measured, ...Object.keys(EXCLUDED)].filter((r) => !routes.includes(r));
    expect(stale, "these entries name no GET route of the app: fix or delete them").toEqual([]);
    expect(Object.keys(EXCLUDED).filter((r) => r in MEASURED)).toEqual([]);
    expect(Object.entries(EXCLUDED).filter(([, why]) => why.trim() === "")).toEqual([]);
  });

  it.each(measured)(
    "US-QG-07 GET %s answers 200 for both sizes and does not grow with the data",
    (pattern) => {
      const key = `GET ${pattern}`;
      for (const size of SIZES)
        expect(
          results[size][key]?.status,
          `${key} for the ${size} keeper: ${results[size][key]?.body}`,
        ).toBe(200);
      const small = results.small[key]?.count ?? NaN;
      const large = results.large[key]?.count ?? NaN;
      if (key in growthBaseline) {
        expect(
          large - small > ALLOWED_GROWTH,
          `${key} is in query-count-baseline.json but no longer grows (${SMALL}: ${small}, ${LARGE}: ${large}): delete the entry`,
        ).toBe(true);
      } else {
        // On a mismatch the message names the statements of both sizes and the extra one (#1301).
        const report =
          large === small
            ? ""
            : `\n${growthReport(
                { size: SMALL, statements: results.small[key]?.statements ?? [] },
                { size: LARGE, statements: results.large[key]?.statements ?? [] },
              )}`;
        expect(
          large - small,
          `${key} sends ${small} statements for ${SMALL} specimens and ${large} for ${LARGE} (N+1)${report}`,
        ).toBeLessThanOrEqual(ALLOWED_GROWTH);
      }
    },
  );

  it.each(measured)(
    "US-QG-07 GET %s sends no statement text twice for the large keeper",
    (pattern) => {
      const key = `GET ${pattern}`;
      const found = repeatFindings(results.large[key]?.statements ?? []);
      const known = repeatBaseline[key] ?? [];
      expect(
        found.filter((f) => !known.includes(f)),
        `${key} sends a statement twice (N+1 or duplicate read): fix it or add the text to query-repeat-baseline.json`,
      ).toEqual([]);
      expect(
        known.filter((k) => !found.includes(k)),
        `${key} no longer sends these statements twice: delete them from query-repeat-baseline.json`,
      ).toEqual([]);
    },
  );

  it("US-QG-07 every baseline entry names an endpoint under test", () => {
    const keys = new Set(measured.map((p) => `GET ${p}`));
    const named = [...Object.keys(growthBaseline), ...Object.keys(repeatBaseline)];
    expect(named.filter((k) => !keys.has(k))).toEqual([]);
  });
});

// NFR-12 (#1238): the friend views of one keeper with 2 and then 6 friends, in their own block so the seed above keeps its
// sizes. The owner's specimens are read as the owner, so each friend costs its own reads (shares, privacy, rows); what
// must not happen is one read per shared specimen or one read of the keeper's collection per friend.
const FRIEND_COUNTS = { two: 2, six: 6 } as const;
type FriendCount = keyof typeof FRIEND_COUNTS;
const SIZE_KEYS: readonly FriendCount[] = ["two", "six"];
// The keeper's own collection: the one read of the viewer's specimens in a friend list (its names follow in one statement).
const OWN_COLLECTION = /from specimen order by lower\(name\)/;
const SHARED_ROWS = /from specimen where id = any\(/;
const countOf = (m: Measured | undefined, shape: RegExp): number =>
  (m?.statements ?? []).filter((s) => shape.test(normalize(s))).length;

describe("NFR-12 friend views read the keeper's collection once and each friend's shared rows in one statement", () => {
  const keeper = `qc-f-${randomUUID()}`;
  const friendSubs = Array.from({ length: FRIEND_COUNTS.six }, () => `qc-f-${randomUUID()}`);
  friendViewSubs.push(keeper, ...friendSubs);
  let firstFriend = "";
  const seen: Record<FriendCount, Record<string, Measured>> = { two: {}, six: {} };

  async function addFriend(i: number): Promise<void> {
    const sub = friendSubs[i] ?? "";
    const tag = `f${String.fromCharCode(97 + i)}`; // letters only: species names take no digits
    await seedFriend({ api, sub, run, tag }, 4, false);
    const id = await befriend(api, keeper, sub, friendName(run, tag));
    if (i === 0) firstFriend = id;
  }

  async function measureAll(size: FriendCount): Promise<void> {
    const paths: Record<string, string> = {
      list: "/friends",
      feed: `/feed?timeZone=${TZ}`,
      shared: `/friends/${firstFriend}/shared`,
      collection: `/friends/${firstFriend}/collection`,
    };
    for (const [name, path] of Object.entries(paths)) {
      await api.call(keeper, "GET", path); // the first call fills caches and creates rows
      counter.reset();
      const r = await api.call(keeper, "GET", path);
      seen[size][name] = {
        status: r.status,
        count: counter.count(),
        statements: counter.statements(),
        body: JSON.stringify(r.body).slice(0, 200),
      };
    }
  }

  beforeAll(async () => {
    await seedFriend({ api, sub: keeper, run, tag: "fk" }, 3, false);
    for (let i = 0; i < FRIEND_COUNTS.two; i++) await addFriend(i);
    await measureAll("two");
    for (let i = FRIEND_COUNTS.two; i < FRIEND_COUNTS.six; i++) await addFriend(i);
    await measureAll("six");
  }, 280_000);

  it("NFR-12 the shared views of one friend send the same statements with 2 and with 6 friends", () => {
    for (const name of ["shared", "collection"]) {
      expect(seen.six[name]?.status, `GET ${name} with 6 friends`).toBe(200);
      expect(
        seen.six[name]?.count,
        `/friends/:id/${name} sends ${seen.two[name]?.count} statements with 2 friends and ${seen.six[name]?.count} with 6`,
      ).toBe(seen.two[name]?.count);
      expect(
        countOf(seen.six[name], SHARED_ROWS),
        `${name}: rows of the friend in one statement`,
      ).toBe(1);
    }
  });

  it("NFR-12 the friend list reads the keeper's own collection once, not once per friend", () => {
    for (const size of SIZE_KEYS)
      expect(
        countOf(seen[size].list, OWN_COLLECTION),
        `list with ${FRIEND_COUNTS[size]} friends`,
      ).toBe(1);
  });

  it("NFR-12 the friend list and the feed read each friend's shared rows once per friend, not per row", () => {
    for (const size of SIZE_KEYS)
      for (const name of ["list", "feed"])
        expect(
          countOf(seen[size][name], SHARED_ROWS),
          `${name} with ${FRIEND_COUNTS[size]} friends (2 shared specimens each)`,
        ).toBe(FRIEND_COUNTS[size]);
  });
});
