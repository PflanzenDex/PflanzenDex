import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNLOCK_FUNCTIONS } from "@pflanzendex/core";
import { migrate, openAdminPool, openPool, testDatabaseUrl } from "@pflanzendex/db";
import { seedCatalog } from "../../catalog-seed/seed-catalog.ts";
import { SEED_SPECIES } from "../../catalog-seed/species-list.ts";
import { Caller } from "../access/caller.ts";
import { resetDemoFriends, restoreAchievementNews } from "../access/reset-demo.ts";
import { parseSubjects } from "../access/subjects.ts";
import { seedAll } from "../accounts/seed-all.ts";
import { daysAgo, TZ } from "../accounts/common/shared.ts";
import { seedEmptyAccount } from "../accounts/common/empty-account.ts";
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
// The hint accounts are the Keycloak users test5 and test6 that the seed creates through the admin API; the test bypasses it.
const HINT_SUBJECT = `st-hint-${DB}`;
const HINT_MEASURE_SUBJECT = `st-hint-measure-${DB}`;
// The empty account test7 (issue 2500) is created through the admin API as well; the test bypasses it the same way.
const EMPTY_SUBJECT = `st-empty-${DB}`;
const SEED_ENV = {
  DEMO_SEED_HINT_SUBJECT: HINT_SUBJECT,
  DEMO_SEED_HINT_MEASURE_SUBJECT: HINT_MEASURE_SUBJECT,
  DEMO_SEED_EMPTY_SUBJECT: EMPTY_SUBJECT,
} as NodeJS.ProcessEnv;

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
      await seedEmptyAccount(pool, { env: SEED_ENV });
      await seedStates(pool, { subjects: SUBJECTS, env: SEED_ENV });
    };
    await run();
    first = await snapshot();
    await run();
    expect(await snapshot()).toEqual(first);
  }, 600_000);

  it("US-DEV-01 the empty account test7 has style few and no plant, wish or friend, and a second run changes none of it (issue 2500)", async () => {
    // The owner connection counts the rows of the account (row security does not apply to it); the API answers what the screens ask.
    const rowsOf = async () => {
      const row = await one(
        `select (select count(*) from specimen s join account a on a.id = s.account_id where a.subject = $1) as specimen,
                (select count(*) from wish w join account a on a.id = w.account_id where a.subject = $1) as wish,
                (select count(*) from friendship f join account a on a.id = f.account_id where a.subject = $1) as friendship`,
        [EMPTY_SUBJECT],
      );
      return {
        specimen: Number(row["specimen"]),
        wish: Number(row["wish"]),
        friendship: Number(row["friendship"]),
      };
    };
    const answers = async () => ({
      style: await get(EMPTY_SUBJECT, "/onboarding/style"),
      plants: list(await get(EMPTY_SUBJECT, "/specimens"), "specimens"),
      summary: await get(EMPTY_SUBJECT, "/specimens/cards/summary"),
    });
    expect(await count("select count(*) n from account where subject = $1", [EMPTY_SUBJECT])).toBe(
      1,
    );
    expect(await rowsOf()).toEqual({ specimen: 0, wish: 0, friendship: 0 });
    expect(await answers()).toMatchObject({
      style: { style: "few", chosen: true },
      plants: [],
      summary: { total: 0 },
    });

    const before = await rowsOf();
    const beforeAnswers = await answers();
    await seedEmptyAccount(pool, { env: SEED_ENV });
    expect(await rowsOf()).toEqual(before);
    expect(await answers()).toEqual(beforeAnswers);
    // The second run adds no second account row for the same subject.
    expect(await count("select count(*) n from account where subject = $1", [EMPTY_SUBJECT])).toBe(
      1,
    );
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

  it("US-QS-32 a plant without location and without target: Ben's phase list shows it with neither (Kein Standort, issue 2322)", async () => {
    const phases = list(await get(subjectOf.ben, `/care-phases?timeZone=${TZ}`), "phases");
    const neu = phases.filter((p) => p["marker"] === "Neu");
    expect(neu).toHaveLength(1);
    expect(neu[0]?.["speciesName"]).toBe("Glücksfeder");
    expect(neu[0]?.["locationId"]).toBeNull();
    expect(neu[0]?.["targetLocationId"]).toBeNull();
    expect(
      await count("select count(*) n from specimen where location_id is null and marker = 'Neu'"),
    ).toBe(1);
  });

  const HINT_ACCOUNTS = [
    ["test5", HINT_SUBJECT],
    ["test6", HINT_MEASURE_SUBJECT],
  ] as const;

  it.each(HINT_ACCOUNTS)(
    "US-ONB-07 · US-QS-23 the hint account %s: style few, calm mode off, one active plant, no measurement (issue 2384)",
    async (_user, sub) => {
      expect(await get(sub, "/onboarding/style")).toMatchObject({ style: "few", chosen: true });
      expect(await get(sub, "/achievements/settings")).toMatchObject({ calmMode: false });
      const plants = list(await get(sub, "/specimens"), "specimens");
      expect(plants).toHaveLength(1);
      const measured = await get(
        sub,
        `/specimens/${plants[0]?.["id"]}/measurements?timeZone=${TZ}`,
      );
      expect(measured["last"] ?? null).toBeNull();
      expect(
        await count(
          "select count(*) n from measurement m join specimen s on s.id = m.specimen_id join account a on a.id = s.account_id where a.subject = $1",
          [sub],
        ),
      ).toBe(0);
    },
  );

  const due = async (sub: string, applicable: string) =>
    (await get(sub, `/onboarding/hints?timeZone=${TZ}&applicable=${applicable}`))["hint"];

  it.each(HINT_ACCOUNTS)(
    "US-ONB-07 · US-QS-23 the hint account %s meets one rule-staged unlock, so Heute has a function_unlocked hint to show (issue 2384)",
    async (_user, sub) => {
      // The same set as `use-hints.ts` of the web: the functions a rule stages, not the ones that are always or first-plant open.
      const staged = new Set<string>(
        UNLOCK_FUNCTIONS.filter((f) => f.rule !== "always" && f.rule !== "first_plant").map(
          (f) => f.id,
        ),
      );
      const unlocks = list(await get(sub, `/onboarding/unlocks?timeZone=${TZ}`), "functions");
      expect(unlocks.some((f) => f["state"] === "open" && staged.has(String(f["id"])))).toBe(true);
      expect(await due(sub, "function_unlocked")).toBe("function_unlocked");
    },
  );

  it("US-ONB-07 · US-QS-23 test5 has first_plant_saved due on the plant layer, ahead of first_measurement (the fixed order of pickHint)", async () => {
    expect(await due(HINT_SUBJECT, "first_plant_saved,first_measurement")).toBe(
      "first_plant_saved",
    );
  });

  it("US-ONB-07 · US-QS-23 test6 has dismissed first_plant_saved, so first_measurement is due and shows first in Verlauf", async () => {
    expect(await due(HINT_MEASURE_SUBJECT, "first_plant_saved,first_measurement")).toBe(
      "first_measurement",
    );
  });

  it("US-ONB-07 · US-QS-23 each seed run restores the hint state of test5 and test6: a shown date that started the 7 days is cleared, test6 keeps its dismissal (issue 2384)", async () => {
    const rowsOf = (sub: string) =>
      count(
        "select count(*) n from account_hint where account_id = (select id from account where subject = $1)",
        [sub],
      );
    const both = "first_plant_saved,first_measurement";
    // A keeper browsed the dev app a month ago: the notes were shown then, so their 7 days are over.
    for (const sub of [HINT_SUBJECT, HINT_MEASURE_SUBJECT])
      for (const occasion of ["first_measurement", "function_unlocked"])
        await api.ok(sub, "PUT", `/onboarding/hints/${occasion}`, { state: "shown", timeZone: TZ });
    await api.ok(HINT_SUBJECT, "PUT", "/onboarding/hints/first_plant_saved", {
      state: "shown",
      timeZone: TZ,
    });
    await pool.query(
      "update account_hint set shown_on = $2 where account_id in (select id from account where subject = any($1))",
      [[HINT_SUBJECT, HINT_MEASURE_SUBJECT], daysAgo(30)],
    );
    expect(await due(HINT_SUBJECT, both)).toBeNull();
    expect(await due(HINT_MEASURE_SUBJECT, "function_unlocked")).toBeNull();

    await seedStates(pool, { subjects: SUBJECTS, env: SEED_ENV });

    expect(await due(HINT_SUBJECT, both)).toBe("first_plant_saved");
    expect(await due(HINT_SUBJECT, "function_unlocked")).toBe("function_unlocked");
    expect(await rowsOf(HINT_SUBJECT)).toBe(0);
    // test6 keeps what makes it test6: first_plant_saved is dismissed, so first_measurement is due.
    expect(await due(HINT_MEASURE_SUBJECT, both)).toBe("first_measurement");
    expect(await due(HINT_MEASURE_SUBJECT, "function_unlocked")).toBe("function_unlocked");
    expect(await rowsOf(HINT_MEASURE_SUBJECT)).toBe(1);
  });

  it("US-DEV-01 a run after a check makes Ben's first-handover new again and Anna's request to Ben open before the states profile declines it (issue 2477)", async () => {
    type Request = { id: string; otherName: string; status: string };
    const requestStatus = async (sub: string, side: "incoming" | "outgoing", name: string) =>
      (((await get(sub, "/friends/requests"))[side] ?? []) as Request[]).find(
        (r) => r.otherName === name,
      )?.status;
    // A device check: Ben opens the achievements, so the handover is seen and no longer new.
    await api.ok(subjectOf.ben, "POST", "/achievements/seen", {
      achievements: ["first-handover"],
      timeZone: TZ,
    });
    expect(list(await get(subjectOf.ben, `/achievements/news?timeZone=${TZ}`), "fresh")).toEqual(
      [],
    );
    // The states run of run-demo-seed.ts, in its order: the friends reset, the base seed, the states profile, the restore.
    await resetDemoFriends(pool, SUBJECTS);
    await seedAll(pool, { subjects: SUBJECTS });
    expect(await requestStatus(subjectOf.anna, "incoming", "Ben")).toBe("requested");
    expect(await requestStatus(subjectOf.ben, "outgoing", "Anna")).toBe("requested");
    expect((await get(subjectOf.anna, "/feed/banner"))["count"]).toBe(1);
    await seedStates(pool, { subjects: SUBJECTS, env: SEED_ENV });
    expect(await requestStatus(subjectOf.ben, "outgoing", "Anna")).toBe("declined");
    await restoreAchievementNews(pool, SUBJECTS);
    expect(
      list(await get(subjectOf.ben, `/achievements/news?timeZone=${TZ}`), "fresh").map(
        (f) => f["id"],
      ),
    ).toContain("first-handover");
  }, 600_000);
});
