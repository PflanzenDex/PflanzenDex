import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-04: the keeper chooses the day of the repot; a date in the future is refused on the field (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup and cleanup only (QG-D1)
const sub = `bes4-date-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, subject] = token.split(":");
  return kind === "valid"
    ? { sub: subject, email: `${subject}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2 October 2026, 23:30 UTC: it is already 3 October in Berlin, so "today" is the keeper's local day (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer valid:${sub}`,
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const run = randomUUID().replace(/-/g, "").slice(0, 10).replace(/[0-9]/g, "q");
let speciesCounter = 0;

/** A new cutting of its own species, so each case starts from an unrepotted cutting; caught on `catchDate` (issue 1103). */
async function freshCutting(catchDate = "2026-09-01"): Promise<string> {
  speciesCounter += 1;
  const name = `Datum${run}${"abcdefgh"[speciesCounter] ?? "z"}`;
  const species = await call("POST", "/species", {
    latinName: `${name} vera`,
    germanName: name,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const created = await call("POST", "/specimens", {
    speciesId: species.body["id"],
    timeZone: "Europe/Berlin",
    status: "cutting",
    catchDate,
  });
  return created.body["id"] as string;
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});

afterAll(async () => {
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = $1)",
    [sub],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = $1))`,
    [sub],
  );
  await admin.query("delete from account where subject = $1", [sub]);
  await pool.end();
  await admin.end();
});

describe("US-BES-04 the repot date", () => {
  it("US-BES-04: a chosen past day is recorded as the repot day and the response shows it", async () => {
    const cutting = await freshCutting();
    const r = await call("POST", `/specimens/${cutting}/repot`, {
      timeZone: "Europe/Berlin",
      date: "2026-09-15",
    });
    expect(r).toMatchObject({ status: 200, body: { status: "plant", repottedAt: "2026-09-15" } });
  });

  it("US-BES-04: a date after today in the keeper's zone is 400 specimen.repotted_in_future on the field date, nothing changes", async () => {
    const cutting = await freshCutting();
    const r = await call("POST", `/specimens/${cutting}/repot`, {
      timeZone: "Europe/Berlin",
      date: "2026-10-04",
    });
    expect(r).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "specimen.repotted_in_future",
          details: [{ field: "date", code: "specimen.repotted_in_future" }],
        },
      },
    });
    expect((await call("GET", `/specimens/${cutting}`)).body["status"]).toBe("cutting");
  });

  it("US-BES-04: a day before the catch date is 400 specimen.repotted_before_caught on the field date, nothing changes", async () => {
    const cutting = await freshCutting("2026-09-01");
    const r = await call("POST", `/specimens/${cutting}/repot`, {
      timeZone: "Europe/Berlin",
      date: "2026-08-31",
    });
    expect(r).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "specimen.repotted_before_caught",
          details: [{ field: "date", code: "specimen.repotted_before_caught" }],
        },
      },
    });
    expect((await call("GET", `/specimens/${cutting}`)).body["status"]).toBe("cutting");
  });

  it("US-BES-04: an older client without a date still records today (the keeper's local day)", async () => {
    const cutting = await freshCutting();
    const r = await call("POST", `/specimens/${cutting}/repot`, { timeZone: "Europe/Berlin" });
    expect(r).toMatchObject({ status: 200, body: { repottedAt: "2026-10-03" } });
  });
});
