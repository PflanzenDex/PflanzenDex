import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ALL_FEATURES,
  isActive,
  keeperOffOf,
  localToday,
  readAchievementSettings,
  readKeeperStyle,
  unlockStates,
  type UnlockInput,
} from "@pflanzendex/core";
import {
  AchievementSettingsPostgres,
  EquipmentPostgres,
  FriendsPostgres,
  KeeperStylePostgres,
  KeeperSwitchPostgres,
  ManualUnlockPostgres,
  OffersPostgres,
  SpecimenPostgres,
  SwapsPostgres,
  WishesPostgres,
  findOrCreateAccount,
  migrate,
  openFixturePool,
  openOwnerPool,
} from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../../app";
import { featureAccess, type FeatureAccess } from "../../../kernel";
import { unlockSources } from "./unlock-sources";

// NFR-12: the unlock facts are read by one aggregate and by existence checks now. They must answer exactly what the
// list-based reads answered before, or an unlock would flip (US-ONB-05). `listFacts` below is that old answer, computed
// from the lists the stores still offer. The data holds the edge cases: archived specimens, a date that differs by time
// zone, discarded and equipment wishes, ended and declined friendships, a withdrawn offer, a canceled swap, retired
// equipment, and another account whose rows must not show up (P-04). Real PostgreSQL, `make db-up`.

const NOW = new Date("2026-10-18T10:00:00Z");
const BERLIN = "Europe/Berlin";

let owner: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
let features: FeatureAccess;
let facts: ReturnType<typeof unlockSources>["facts"];
let styles: KeeperStylePostgres;
let calm: AchievementSettingsPostgres;
let unlocks: ManualUnlockPostgres;
let switches: KeeperSwitchPostgres;
let specimens: SpecimenPostgres;
let wishes: WishesPostgres;
let friends: FriendsPostgres;
let offers: OffersPostgres;
let swaps: SwapsPostgres;
let equipment: EquipmentPostgres;
const subjects: string[] = [];

const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
  app = createApp({ reviewer, pool: owner, clock: () => NOW, features: ALL_FEATURES });
  features = featureAccess(owner, ALL_FEATURES);
  facts = unlockSources(owner, { features, clock: () => NOW }).facts;
  styles = new KeeperStylePostgres(owner);
  calm = new AchievementSettingsPostgres(owner);
  unlocks = new ManualUnlockPostgres(owner);
  switches = new KeeperSwitchPostgres(owner);
  specimens = new SpecimenPostgres(owner);
  wishes = new WishesPostgres(owner);
  friends = new FriendsPostgres(owner);
  offers = new OffersPostgres(owner);
  swaps = new SwapsPostgres(owner);
  equipment = new EquipmentPostgres(owner);
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [subjects]);
  await owner.end();
  await admin.end();
});

async function call(sub: string, method: string, path: string, body?: unknown) {
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

const letters = () =>
  randomUUID()
    .replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)] ?? "x")
    .replace(/-/g, "")
    .slice(0, 12);

/** An account with one species of its own, created through the API; the rows of the edge cases are written by SQL. */
interface Keeper {
  readonly id: string;
  readonly sub: string;
  readonly speciesId: string;
}
async function keeper(): Promise<Keeper> {
  const sub = `nfr12-${randomUUID()}`;
  subjects.push(sub);
  const id = await findOrCreateAccount(owner, sub);
  const r = await call(sub, "POST", "/species", {
    latinName: `Nfr${letters()} sp`,
    germanName: `Nfr Art ${letters()}`,
    difficulty: 1,
    standardLevel: 2,
    lightDemandLux: 10000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  if (typeof r.body["id"] !== "string")
    throw new Error(`species not created: ${JSON.stringify(r.body)}`);
  return { id, sub, speciesId: r.body["id"] };
}

async function specimen(
  k: Keeper,
  o: { createdAt?: string; archived?: boolean } = {},
): Promise<string> {
  const r = await admin.query(
    `insert into specimen (account_id, species_id, name, created_at, status, archived_at, archived_reason,
                           status_before_archived)
     values ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6::date, $7, $8) returning id`,
    [
      k.id,
      k.speciesId,
      `Topf ${randomUUID()}`,
      o.createdAt ?? null,
      o.archived ? "archived" : "plant",
      o.archived ? "2026-10-18" : null,
      o.archived ? "test" : null,
      o.archived ? "plant" : null,
    ],
  );
  return (r.rows[0] as { id: string }).id;
}

async function wish(k: Keeper, o: { status: string; type?: "plant" | "equipment" }) {
  const gear = o.type === "equipment";
  await admin.query(
    "insert into wish (account_id, name, status, type, equipment_type) values ($1, $2, $3, $4, $5)",
    [k.id, `Wunsch ${randomUUID()}`, o.status, gear ? "equipment" : "plant", gear ? "Lamp" : null],
  );
}

/** A friendship as the app stores it: one row per side, the other side mirrored. */
async function befriend(
  a: Keeper,
  b: Keeper,
  direction: "sent" | "received",
  status: "requested" | "confirmed" | "declined" | "ended",
) {
  const mirror = direction === "sent" ? "received" : "sent";
  await admin.query(
    "insert into friendship (account_id, other_id, direction, status) values ($1, $2, $3, $4), ($2, $1, $5, $4)",
    [a.id, b.id, direction, status, mirror],
  );
}

async function offer(k: Keeper, status: string) {
  const specimenId = await specimen(k);
  await admin.query(
    "insert into offer (account_id, specimen_id, type, mode, status) values ($1, $2, 'cutting', 'swap', $3)",
    [k.id, specimenId, status],
  );
}

async function swap(k: Keeper, other: Keeper, status: string) {
  await admin.query(
    `insert into swap (account_id, swap_id, role, other_id, other_name, offer_id, type, mode, status)
     values ($1, gen_random_uuid(), 'recipient', $2, 'Ben', gen_random_uuid(), 'cutting', 'swap', $3)`,
    [k.id, other.id, status],
  );
}

async function gear(k: Keeper, status: string) {
  await admin.query(
    "insert into equipment (account_id, type, name, status) values ($1, 'Lamp', $2, $3)",
    [k.id, `Lampe ${randomUUID()}`, status],
  );
}

/** Manual unlock, calm mode and an explicit keeper style: the settings the facts read beside the lists. */
async function settings(k: Keeper) {
  await admin.query(
    "insert into account_unlock (account_id, function_id, unlocked_on, source) values ($1, 'year_in_review', '2026-10-01', 'tap')",
    [k.id],
  );
  await admin.query("insert into achievement_setting (account_id, calm_mode) values ($1, true)", [
    k.id,
  ]);
  await admin.query(
    "insert into account_style (account_id, style, chosen_on) values ($1, 'few', '2026-07-01')",
    [k.id],
  );
}

/** The facts as the list-based read computed them before NFR-12: every row fetched and filtered in code. */
async function listFacts(userId: string, timeZone: string): Promise<UnlockInput> {
  const rows = await specimens.list(userId);
  const dates = rows
    .map((r) => (r.createdAt ? localToday(new Date(r.createdAt), timeZone) : r.caughtAt))
    .filter((d): d is string => d !== null)
    .sort();
  const openWishes = await wishes.open(userId);
  const boughtWishes = await wishes.bought(userId);
  const friendRows = await friends.friends(userId);
  const requests = await friends.openRequests(userId);
  const offerRows = await offers.list(userId);
  const swapRows = await swaps.list(userId);
  const gearRows = await equipment.list(userId);
  const existingData = new Set<string>();
  if (openWishes.length + boughtWishes.length > 0)
    ["wishlist", "discover"].forEach((id) => existingData.add(id));
  if (friendRows.length + requests.length > 0)
    ["friends", "swapping"].forEach((id) => existingData.add(id));
  if (offerRows.length + swapRows.length > 0) existingData.add("swapping");
  if (gearRows.length > 0) existingData.add("equipment");
  const enabled = Object.entries(await features.states(userId))
    .filter(([, on]) => on)
    .map(([name]) => name);
  return {
    style: await readKeeperStyle(styles, userId),
    activeSpecimens: rows.filter(isActive).length,
    firstSpecimenDate: dates[0] ?? null,
    today: localToday(NOW, timeZone),
    calmMode: (await readAchievementSettings(calm, userId)).calmMode,
    features: new Set(enabled) as UnlockInput["features"],
    manualUnlocks: new Set((await unlocks.list(userId)).map((u) => u.id)),
    existingData,
    keeperOff: keeperOffOf(await switches.list(userId)),
  };
}

/** The facts from the new reads must equal the list answer, and so must every lock state derived from them. */
async function expectListAnswer(k: Keeper, timeZone = BERLIN): Promise<UnlockInput> {
  const now = await facts(k.id, timeZone);
  const before = await listFacts(k.id, timeZone);
  expect(now).toEqual(before);
  expect(unlockStates(now)).toEqual(unlockStates(before));
  return now;
}

describe("NFR-12 unlock facts: specimens (one aggregate instead of the whole list)", () => {
  it.each([
    [BERLIN, "2026-10-18"],
    ["UTC", "2026-10-17"],
  ])(
    "NFR-12 the first date is the local day of the first creation (%s): an archived specimen keeps it",
    async (timeZone, date) => {
      const k = await keeper();
      // 23:30 UTC is already the next day in Berlin; the archived specimen is the first one ever created.
      await specimen(k, { createdAt: "2026-10-17T23:30:00Z", archived: true });
      await specimen(k, { createdAt: "2026-10-20T08:00:00Z" });
      const now = await expectListAnswer(k, timeZone);
      expect(now.firstSpecimenDate).toBe(date);
      expect(now.activeSpecimens).toBe(1);
    },
  );

  it("NFR-12 only archived specimens: no active one, the first date stays", async () => {
    const k = await keeper();
    await specimen(k, { createdAt: "2026-09-01T09:00:00Z", archived: true });
    const now = await expectListAnswer(k);
    expect(now.activeSpecimens).toBe(0);
    expect(now.firstSpecimenDate).toBe("2026-09-01");
  });

  it("NFR-12 an account without specimens: no date and no active specimen", async () => {
    const k = await keeper();
    const now = await expectListAnswer(k);
    expect(now.activeSpecimens).toBe(0);
    expect(now.firstSpecimenDate).toBeNull();
  });
});

describe("NFR-12 unlock facts: existing data, each source against the list answer", () => {
  const cases: [name: string, seed: (a: Keeper, b: Keeper) => Promise<void>, open: string[]][] = [
    [
      "a plant wish on the wishlist",
      (a) => wish(a, { status: "wishlist" }),
      ["discover", "wishlist"],
    ],
    ["a bought plant wish", (a) => wish(a, { status: "bought" }), ["discover", "wishlist"]],
    ["a discarded plant wish", (a) => wish(a, { status: "discarded" }), []],
    ["an equipment wish", (a) => wish(a, { status: "wishlist", type: "equipment" }), []],
    [
      "a confirmed friendship",
      (a, b) => befriend(a, b, "sent", "confirmed"),
      ["friends", "swapping"],
    ],
    [
      "an open request received",
      (a, b) => befriend(a, b, "received", "requested"),
      ["friends", "swapping"],
    ],
    [
      "a declined request the account sent",
      (a, b) => befriend(a, b, "sent", "declined"),
      ["friends", "swapping"],
    ],
    ["an ended friendship", (a, b) => befriend(a, b, "sent", "ended"), []],
    [
      "a declined request the account received",
      (a, b) => befriend(a, b, "received", "declined"),
      [],
    ],
    ["a withdrawn offer", (a) => offer(a, "withdrawn"), ["swapping"]],
    ["a canceled swap", (a, b) => swap(a, b, "canceled"), ["swapping"]],
    ["retired equipment", (a) => gear(a, "retired"), ["equipment"]],
    ["nothing at all", async () => {}, []],
  ];
  it.each(cases)(
    "NFR-12 %s: the existing data equals the list answer",
    async (_name, seed, open) => {
      const a = await keeper();
      const b = await keeper();
      await seed(a, b);
      const now = await expectListAnswer(a);
      expect([...now.existingData].sort()).toEqual([...open].sort());
    },
  );

  it("NFR-12 manual unlocks, calm mode and the keeper style are read as before", async () => {
    const k = await keeper();
    await settings(k);
    const now = await expectListAnswer(k);
    expect([...now.manualUnlocks]).toEqual(["year_in_review"]);
    expect(now.calmMode).toBe(true);
    expect(now.style).toBe("few");
  });
});

describe("NFR-12 unlock facts: tenants and the pool", () => {
  it("NFR-12 another account's rows never change the facts (P-04): a stranger with no rows sees none", async () => {
    const a = await keeper();
    const c = await keeper();
    const stranger = await keeper();
    await specimen(a, { createdAt: "2026-10-17T23:30:00Z", archived: true });
    await wish(a, { status: "bought" });
    await befriend(a, c, "sent", "confirmed");
    await offer(a, "withdrawn");
    await swap(a, c, "canceled");
    await gear(a, "retired");
    await settings(a);
    const seen = await expectListAnswer(stranger);
    expect(seen).toMatchObject({ activeSpecimens: 0, firstSpecimenDate: null });
    expect(seen.existingData.size).toBe(0);
    await expectListAnswer(a);
  });

  it("NFR-12 twelve reads at once all finish: the parallel reads of one request never wait on each other", async () => {
    const k = await keeper();
    await specimen(k);
    const answers = await Promise.all(Array.from({ length: 12 }, () => facts(k.id, BERLIN)));
    for (const answer of answers) expect(answer.activeSpecimens).toBe(1);
  });

  it("NFR-12 one failing read is reported, not swallowed: the whole answer rejects (P-10)", async () => {
    const k = await keeper();
    const broken = unlockSources(owner, {
      features: {
        enabled: async () => true,
        states: async () => {
          throw new Error("feature read failed");
        },
      },
      clock: () => NOW,
    });
    await expect(broken.facts(k.id, BERLIN)).rejects.toThrow("feature read failed");
    await expect(facts("not-a-uuid", BERLIN)).rejects.toThrow("Account id is not a UUID");
  });
});
