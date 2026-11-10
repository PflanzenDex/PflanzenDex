import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openAdminPool, openPool, testDatabaseUrl } from "@pflanzendex/db";
import { seedCatalog } from "../../catalog-seed/seed-catalog.ts";
import { SEED_SPECIES } from "../../catalog-seed/species-list.ts";
import { Caller } from "../access/caller.ts";
import { parseSubjects } from "../access/subjects.ts";
import { seedAll } from "../accounts/seed-all.ts";
import { daysAgo, TZ } from "../accounts/common/shared.ts";
import { seedStates } from "./profile.ts";

// US-DEV-01 / #1072: the states profile makes every feature state of the inventory reachable (states/states-map.md). The test runs
// the base seed and the profile on a scratch database, twice, and checks each state through the API of its account or a
// count of the owner connection. It is the proof that the states exist; the mapping says where to see them.
const DB = `states_seed_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const SUBJECTS = parseSubjects(`test=st-anna-${DB},test2=st-ben-${DB},test3=st-clara-${DB}`);
let admin: Pool;
let pool: Pool;
let api: Caller;
const subjectOf = { anna: SUBJECTS.test, ben: SUBJECTS.test2, clara: SUBJECTS.test3 };

const scratchUrl = () => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  return url.toString();
};
type Rows = { rows: Record<string, unknown>[] };
const one = async (sql: string, args: unknown[] = []): Promise<Record<string, unknown>> =>
  ((await pool.query(sql, args)) as Rows).rows[0] ?? {};
const count = async (sql: string, args: unknown[] = []): Promise<number> =>
  Number((await one(sql, args))["n"]);
const get = (sub: string, path: string) => api.ok(sub, "GET", path);
const list = (body: Record<string, unknown>, key: string) =>
  (body[key] ?? []) as Record<string, unknown>[];
const snapshot = async () => ({
  roles: await count("select count(*) n from account_role"),
  review: await count("select count(*) n from review_case"),
  friendship: await count("select count(*) n from friendship"),
  swap: await count("select count(*) n from swap"),
  offer: await count("select count(*) n from offer"),
  wish: await count("select count(*) n from wish"),
  equipment: await count("select count(*) n from equipment"),
  measurement: await count("select count(*) n from measurement"),
  treatment: await count("select count(*) n from treatment"),
  specimen: await count("select count(*) n from specimen"),
  locations: await count("select count(*) n from location"),
});

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  pool = openPool(scratchUrl());
  pool.on("error", () => undefined);
  await migrate(pool);
  await seedCatalog(pool, SEED_SPECIES);
  api = new Caller(pool, new Map());
}, 120_000);
afterAll(async () => {
  await pool.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

describe("US-DEV-01 states profile makes every inventory state reachable (#1072)", () => {
  let first: Awaited<ReturnType<typeof snapshot>>;
  it("US-DEV-01 the base seed and the states profile run and a second run changes nothing", async () => {
    const run = async () => {
      await seedAll(pool, { subjects: SUBJECTS });
      await seedStates(pool, { subjects: SUBJECTS });
    };
    await run();
    first = await snapshot();
    await run();
    expect(await snapshot()).toEqual(first);
  }, 600_000);

  it("US-DEV-01 roles and the review queue: reviewer and operator, open and approved cases, the Dublette hint", async () => {
    const roles = (
      await pool.query(
        "select r.role from account_role r join account a on a.id = r.account where a.subject = $1 order by r.role",
        [subjectOf.clara],
      )
    ).rows.map((r) => r["role"]);
    expect(roles).toEqual(["operator", "reviewer"]);
    const review = list(await get(subjectOf.clara, "/review"), "entries");
    const pilea = review.find(
      (e) => (e["species"] as { latinName?: string } | null)?.latinName === "Pilea glauca",
    );
    expect(JSON.stringify(pilea?.["issues"])).toMatch(/source/);
    const kerri = review.find(
      (e) => (e["species"] as { latinName?: string } | null)?.latinName === "Hoya kerri",
    );
    expect(JSON.stringify(kerri?.["similar"])).toContain("Hoya kerrii");
    expect(
      await count("select count(*) n from review_case where status = 'reviewed'"),
    ).toBeGreaterThan(0);
  });

  it("US-DEV-01 operator area: a monthly cost and an open invitation", async () => {
    const overview = await get(subjectOf.clara, "/operator/overview");
    expect(list(overview, "invitations").filter((i) => i["status"] === "open")).toHaveLength(1);
    expect(JSON.stringify(overview)).toContain('"source":"manual"'); // the UI text "manuell eingetragen" (US-ACC-05)
  });

  it("US-DEV-01 friends: Ben's request to Anna is declined (sender sees it), Clara's long wishlist for the pager", async () => {
    const outgoing = list(await get(subjectOf.ben, "/friends/requests"), "outgoing");
    expect(outgoing.some((r) => r["status"] === "declined")).toBe(true);
    const wishes = await get(subjectOf.clara, "/wishes/candidates");
    expect(list(wishes, "candidates").length).toBeGreaterThanOrEqual(40);
  });

  it("US-DEV-01 feed: Anna's banner counts the new friend plant after her first visit (US-SOZ-06)", async () => {
    const banner = await get(subjectOf.anna, "/feed/banner");
    expect(banner["count"]).toBe(1);
  });

  it("US-DEV-01 match deck: a card that fits both ways and a card on the wishlist", async () => {
    const deck = list(await get(subjectOf.clara, `/exchange/match?timeZone=${TZ}`), "cards");
    const reasons = JSON.stringify(deck);
    expect(reasons).toContain("both_ways");
    expect(reasons).toContain("wishlist");
  });

  it("US-DEV-01 swaps: a handed-over swap, an open request, a one-sided handover", async () => {
    const received = async (sub: string) =>
      list(await get(sub, `/swaps?timeZone=${TZ}`), "received");
    const ben = await received(subjectOf.ben);
    expect(
      ben.some((s) => s["status"] === "handed_over" && s["speciesLatin"] === "Dracaena fragrans"),
    ).toBe(true);
    const clara = await received(subjectOf.clara);
    expect(
      clara.some(
        (s) =>
          s["status"] === "accepted" &&
          s["confirmedGiver"] === true &&
          s["confirmedRecipient"] === false,
      ),
    ).toBe(true);
    expect(clara.some((s) => s["status"] === "requested")).toBe(true);
  });

  it("US-DEV-01 wishlist history: bought, discarded, no zone and unsuitable zone", async () => {
    expect(list(await get(subjectOf.clara, "/wishes/bought"), "bought").length).toBeGreaterThan(0);
    expect(
      list(await get(subjectOf.clara, "/wishes/discarded"), "discarded").length,
    ).toBeGreaterThan(0);
    const names = list(await get(subjectOf.clara, "/wishes/candidates"), "candidates");
    expect(names.some((w) => w["name"] === "Peperomia prostrata")).toBe(true);
    expect(names.some((w) => w["name"] === "Pilea glauca")).toBe(true);
  });

  it("US-DEV-01 equipment: a price, an equipment wish, a sensor assignment, a defective lamp, a lux deviation", async () => {
    const equipment = list(await get(subjectOf.ben, "/equipment"), "equipment");
    expect(equipment.some((e) => e["priceEur"] === 129.9)).toBe(true);
    expect(equipment.some((e) => e["status"] === "defective")).toBe(true);
    const lamps = (await get(subjectOf.ben, "/equipment/lamps")) as { lamps: { check: unknown }[] };
    expect(lamps.lamps.some((l) => l.check !== null)).toBe(true);
    expect(JSON.stringify(await get(subjectOf.ben, "/equipment/wishes"))).toContain(
      "Pflanzenlampe Wohnzimmer",
    );
  });

  it("US-DEV-01 measurements: an etiolated one today, a series over 90 days", async () => {
    expect(
      await count("select count(*) n from measurement where quality = 'etiolated'"),
    ).toBeGreaterThan(0);
    const span = await one(
      "select (max(m.date) - min(m.date)) n from measurement m join specimen s on s.id = m.specimen_id join species sp on sp.id = s.species_id where sp.latin_name = 'Hoya carnosa' and s.account_id = (select id from account where subject = $1)",
      [subjectOf.clara],
    );
    expect(Number(span["n"])).toBeGreaterThanOrEqual(90);
  });

  it("US-DEV-01 achievements: Ben has an earned achievement that is new (unseen banner)", async () => {
    const news = await get(subjectOf.ben, `/achievements/news?timeZone=${TZ}`);
    expect(list(news, "fresh").map((f) => f["id"])).toContain("first-handover");
  });

  it("US-DEV-01 care: a treatment due today, a catch date a year ago, a location without zone, a specimen without location", async () => {
    const treatments = JSON.stringify(await get(subjectOf.ben, `/treatments?timeZone=${TZ}`));
    expect(treatments).toContain("Spinnmilben");
    expect(
      await count("select count(*) n from specimen where caught_at = $1", [daysAgo(365)]),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) n from location where name = 'Dachboden' and light_zone_id is null",
      ),
    ).toBe(1);
    expect(
      await count("select count(*) n from specimen where location_id is null"),
    ).toBeGreaterThan(0);
  });
});
