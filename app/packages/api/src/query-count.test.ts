import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp } from "./app";
import { countingPool, type CountingPool } from "./count-queries";

// US-QG-07: the number of SQL statements of a request must not grow with the amount of the keeper's data (N+1).
// Every endpoint is called for a small and a larger data set; the counts must be equal. Endpoints that already grow
// are listed in `query-count-baseline.json` (findings, only shrinks): a new one fails, a fixed one must be deleted.
const SMALL = 5;
const LARGE = 50;
const ALLOWED_GROWTH = 0; // statements; any growth with the data is an N+1 (starting value, assumption)
const NOW = new Date("2026-10-03T10:00:00Z");
const TZ = "timeZone=Europe/Berlin";
const ENDPOINTS = [
  `/today?${TZ}`,
  `/specimens/cards?${TZ}`,
  "/specimens",
  "/specimens/distribution",
  "/specimens/light-overview",
  "/specimens/difficulty",
  "/specimens/hints",
  "/species?q=",
  `/discover/suggestions?${TZ}`,
];
const baseline = JSON.parse(
  readFileSync(new URL("query-count-baseline.json", import.meta.url), "utf8"),
) as Record<string, string>;

let admin: Pool;
let pool: Pool;
let counter: CountingPool;
let app: ReturnType<typeof createApp>;
const run = randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 10);
const subs = { small: `qc-s-${randomUUID()}`, large: `qc-l-${randomUUID()}` };
const counts: Record<string, Record<string, number>> = { small: {}, large: {} };

async function call(sub: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
      authorization: `Bearer valid:${sub}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function ok(sub: string, method: string, path: string, body?: unknown) {
  const r = await call(sub, method, path, body);
  if (r.status >= 300)
    throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** An account with `n` species, specimens (each in its own location), measurements and treatments. */
async function seed(sub: string, n: number): Promise<void> {
  const zone = await ok(sub, "POST", "/light-zones", { name: `Zone ${run}`, luxCeiling: 30000 });
  for (let i = 0; i < n; i++) {
    const letters =
      String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
    const species = await ok(sub, "POST", "/species", {
      latinName: `Zaehlus${run}${letters} test`,
      germanName: `Zaehl ${run} ${letters}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    });
    const location = await ok(sub, "POST", "/locations", {
      name: `Regal ${run} ${letters}`,
      kind: "indoor",
      lightZoneId: zone["id"],
    });
    const specimen = await ok(sub, "POST", "/specimens", {
      speciesId: species["id"],
      locationId: location["id"],
      marker: `m${letters}`,
      timeZone: "Europe/Berlin",
    });
    for (const date of ["2026-09-20", "2026-10-01"])
      await ok(sub, "POST", `/specimens/${specimen["id"]}/measurements`, {
        timeZone: "Europe/Berlin",
        value: 10,
        date,
      });
    await ok(sub, "POST", "/treatments", {
      specimenIds: [specimen["id"]],
      reason: "Wollläuse",
      date: "2026-10-01",
    });
  }
}

async function measure(size: "small" | "large"): Promise<void> {
  for (const path of ENDPOINTS) {
    await call(subs[size], "GET", path); // warm-up: first use of an account creates rows, caches fill
    counter.reset();
    const r = await call(subs[size], "GET", path);
    expect(r.status, `GET ${path}`).toBe(200);
    (counts[size] as Record<string, number>)[`GET ${path.split("?")[0]}`] = counter.count();
  }
}

beforeAll(async () => {
  admin = openFixturePool();
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
  app = createApp({ reviewer: verifier, pool, clock: () => NOW });
  await seed(subs.small, SMALL);
  await seed(subs.large, LARGE);
  await measure("small");
  await measure("large");
}, 280_000);

afterAll(async () => {
  const both = [subs.small, subs.large];
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [both],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [both],
  );
  await admin.query("delete from account where subject = any($1)", [both]);
  await pool.end();
  await admin.end();
});

describe("US-QG-07 statements per request do not grow with the data (N+1)", () => {
  it.each(ENDPOINTS.map((p) => `GET ${p.split("?")[0]}`))("US-QG-07 %s", (endpoint) => {
    const small = counts["small"]?.[endpoint] ?? NaN;
    const large = counts["large"]?.[endpoint] ?? NaN;
    const grows = large - small > ALLOWED_GROWTH;
    if (endpoint in baseline) {
      expect(
        grows,
        `${endpoint} is in query-count-baseline.json but no longer grows (${SMALL}: ${small}, ${LARGE}: ${large}): delete the entry`,
      ).toBe(true);
    } else {
      expect(
        large - small,
        `${endpoint} sends ${small} statements for ${SMALL} specimens and ${large} for ${LARGE} (N+1)`,
      ).toBeLessThanOrEqual(ALLOWED_GROWTH);
    }
  });

  it("US-QG-07 every baseline entry names an endpoint under test", () => {
    const known = new Set(ENDPOINTS.map((p) => `GET ${p.split("?")[0]}`));
    expect(Object.keys(baseline).filter((k) => !known.has(k))).toEqual([]);
  });
});
