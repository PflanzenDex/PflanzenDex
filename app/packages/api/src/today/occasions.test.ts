import { randomUUID } from "node:crypto";
import type { PhaseLocationSource } from "@pflanzendex/core";
import { ProfilePostgres, migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import { reminderOccasionsFor } from "./index";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-MON-03, US-MON-04, FR-MON-03: the occasions of the reminders come from the same status function as "Today".
let pool: Pool;
let admin: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const sub = `occ-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, s] = token.split(":");
  return kind === "valid"
    ? { sub: s, email: `${s}@example.test`, name: "Test", email_verified: true }
    : null;
};
// The specimen is caught on 2026-10-03 (local date at this moment in Berlin, NFR-08).
const CREATED = new Date("2026-10-02T23:30:00Z");
let app: ReturnType<typeof createApp>;
let account = "";
let specimenId = "";

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
      authorization: `Bearer valid:${sub}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const noMeasurements = { forSpecimens: async () => new Map() };
// The care profile (US-BES-09) is played by a test source: target location per species and phase.
const targets: Record<string, { dormancy?: string; growth?: string }> = {};
const phaseLocation: PhaseLocationSource = {
  phaseLocation: async (_user, speciesId, phase) => targets[speciesId]?.[phase] ?? null,
};
const source = () =>
  reminderOccasionsFor(pool, {
    measurements: noMeasurements,
    zoneStock: { stock: async () => [] },
    phaseLocation,
  });
const ids = async (now: Date) =>
  (await source().occasions(account, "Europe/Berlin", now)).map((o) => o.id);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => CREATED });
  await call("PUT", "/account/profile", {
    displayName: "Occ",
    timeZone: "Europe/Berlin",
    everythingPrivate: false,
    noRecommendations: false,
    notifications: {},
    replenishBuffer: null,
  });
  account = (await admin.query("select id from account where subject = $1", [sub])).rows[0].id;
  const species = await call("POST", "/species", {
    latinName: `Erinnerung${run} test`,
    germanName: `Erinnerung ${run}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const created = await call("POST", "/specimens", {
    speciesId: species["id"],
    marker: "erinnern",
    timeZone: "Europe/Berlin",
  });
  specimenId = created["id"] as string;
  await call("POST", "/treatments", {
    specimenIds: [specimenId],
    reason: "Wollläuse",
    date: "2026-10-01",
  });
});
afterAll(async () => {
  await admin.query("delete from specimen where account_id = $1", [account]);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id = $1)`,
    [account],
  );
  await admin.query("delete from account where subject = $1", [sub]);
  await pool.end();
  await admin.end();
});

describe("US-MON-03 US-MON-04 the occasions of the reminders", () => {
  it("US-MON-03 an overdue treatment is an occasion with the id and action of the Today list (FR-MON-03)", async () => {
    const list = await source().occasions(account, "Europe/Berlin", CREATED);
    const t = list.find((o) => o.occasion === "treatment");
    expect(t?.id).toMatch(/^treatment:/);
    expect(t?.nextAction.length).toBeGreaterThan(0);
    const today = await call("GET", "/today?timeZone=Europe/Berlin");
    expect((today["items"] as { id: string }[]).map((i) => i.id)).toContain(t?.id);
  });

  it("US-MON-04 a plant is reported as not measured only after the days of the setting, not earlier", async () => {
    expect(await ids(new Date("2026-11-01T12:00:00Z"))).not.toContain(`measurement:${specimenId}`);
    const late = await source().occasions(
      account,
      "Europe/Berlin",
      new Date("2026-11-05T12:00:00Z"),
    );
    const m = late.find((o) => o.id === `measurement:${specimenId}`);
    expect(m?.occasion).toBe("measurement");
    expect(m?.text).toContain("noch nie gemessen");
  });

  it("US-MON-08 an occasion switched off in the profile is not reported, the Today list still shows the treatment (FR-MON-03)", async () => {
    const profiles = new ProfilePostgres(pool);
    const own = await profiles.find(account);
    await profiles.update(account, {
      displayName: own?.displayName ?? null,
      timeZone: "Europe/Berlin",
      everythingPrivate: false,
      noRecommendations: false,
      notifications: { ...own?.notifications, treatment: false },
      replenishBuffer: null,
    });
    const list = await ids(new Date("2026-11-05T12:00:00Z"));
    expect(list.some((i) => i.startsWith("treatment:"))).toBe(false);
    expect(list).toContain(`measurement:${specimenId}`);
    const today = await call("GET", "/today?timeZone=Europe/Berlin");
    expect((today["items"] as { kind: string }[]).some((i) => i.kind === "treatment_overdue")).toBe(
      true,
    );
  });
});

describe("US-MON-02 the reminder at the phase change", () => {
  const FIRST_DORMANCY_DAY = new Date("2026-10-31T23:30:00Z"); // 1 November in Berlin, 31 October in UTC (NFR-08)
  let sleepy = "";
  let summer = "";
  let winter = "";

  beforeAll(async () => {
    const species = await call("POST", "/species", {
      latinName: `Ruhe${run} test`,
      germanName: `Ruhe ${run}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    });
    const place = async (name: string) =>
      (
        await call("POST", "/locations", {
          name: `${name} ${run}`,
          kind: "indoor",
          lightZoneId: null,
        })
      )["id"] as string;
    summer = await place("Sommer");
    winter = await place("Winter");
    targets[species["id"] as string] = { dormancy: winter, growth: summer };
    sleepy = (
      await call("POST", "/specimens", {
        speciesId: species["id"],
        marker: "ruhe",
        timeZone: "Europe/Berlin",
        locationId: summer,
      })
    )["id"] as string;
  });

  it("US-MON-02 on the first day of the dormancy a specimen at the summer location is reminded, once", async () => {
    const list = await source().occasions(account, "Europe/Berlin", FIRST_DORMANCY_DAY);
    const o = list.find((i) => i.id === `phase_change:${sleepy}:2026-11-01`);
    expect(o?.occasion).toBe("phase");
    expect(o?.text).toContain("heute beginnt die Ruhephase");
    expect(list.filter((i) => i.id.startsWith("phase_change:"))).toHaveLength(1);
  });

  it("US-MON-02 the day before and the day after there is no reminder", async () => {
    for (const day of ["2026-10-30T12:00:00Z", "2026-11-02T12:00:00Z"])
      expect((await ids(new Date(day))).some((i) => i.startsWith("phase_change:"))).toBe(false);
  });

  it("US-MON-02 no reminder once the specimen stands at the new location", async () => {
    await call("POST", `/specimens/${sleepy}/location`, { locationId: winter });
    expect((await ids(FIRST_DORMANCY_DAY)).some((i) => i.startsWith("phase_change:"))).toBe(false);
  });

  it("US-MON-02 an occasion switched off in the profile (phase) is not reported", async () => {
    await call("POST", `/specimens/${sleepy}/location`, { locationId: summer });
    expect((await ids(FIRST_DORMANCY_DAY)).some((i) => i.startsWith("phase_change:"))).toBe(true);
    const profiles = new ProfilePostgres(pool);
    const own = await profiles.find(account);
    await profiles.update(account, {
      displayName: own?.displayName ?? null,
      timeZone: "Europe/Berlin",
      everythingPrivate: false,
      noRecommendations: false,
      notifications: { ...own?.notifications, phase: false },
      replenishBuffer: null,
    });
    expect((await ids(FIRST_DORMANCY_DAY)).some((i) => i.startsWith("phase_change:"))).toBe(false);
  });
});
