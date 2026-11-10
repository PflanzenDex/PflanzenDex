import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../../collection/shared/test-helpers";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  specimenCorrectCatchDate,
  specimenCreate,
  NO_TARGET_LOCATION,
  type CatchDateStore,
} from "../../collection";
import { pokedexOwnership, type OwnershipDependencies } from "../index";

const LEMON = "11111111-1111-4111-8111-111111111111";
const LEMON_B = "22222222-2222-4222-8222-222222222222";
const species = new SpeciesStub([
  { species: testSpecies(LEMON, { latinName: "Citrus x limon" }) },
  { species: testSpecies(LEMON_B, { latinName: "Citrus limon 'Meyer'" }) },
]);
let specimens: InMemorySpecimens;
const deps = (): OwnershipDependencies => ({ specimens, species });

type Dates = {
  caughtAt: string | null;
  createdAt: string | null;
  archived?: boolean;
  speciesId?: string;
};
let n = 0;
const add = async (userId: string, d: Dates) => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId: d.speciesId ?? LEMON,
    name: `Zitrone ${n}`,
    marker: null,
    locationId: null,
    caughtAt: d.caughtAt,
  });
  if (typeof r === "string") throw new Error(r);
  const i = specimens.rows.findIndex((z) => z.id === r.id);
  const row = specimens.rows[i];
  if (row)
    specimens.rows[i] = {
      ...row,
      createdAt: d.createdAt,
      ...(d.archived ? { status: "archived" as const } : {}),
    };
};
const dateOf = async (userId: string, timeZone = "Europe/Berlin") =>
  (await pokedexOwnership(deps(), userId, timeZone)).caught[0]?.caughtDate;

beforeEach(() => {
  specimens = new InMemorySpecimens();
});

describe("US-POK-07 catch date: source order per specimen", () => {
  it("US-POK-07 Caught_At wins and is exact", async () => {
    await add("anna", { caughtAt: "2026-03-05", createdAt: "2026-09-01T10:00:00Z" });
    expect(await dateOf("anna")).toEqual({ date: "2026-03-05", source: "caught_at" });
  });

  it("US-POK-07 without Caught_At the creation date counts, marked as approximate", async () => {
    await add("anna", { caughtAt: null, createdAt: "2026-09-01T10:00:00Z" });
    expect(await dateOf("anna")).toEqual({ date: "2026-09-01", source: "created_at" });
  });

  it("US-POK-07 the creation date is the local date of the time zone, not the UTC date (NFR-08)", async () => {
    await add("anna", { caughtAt: null, createdAt: "2026-10-02T23:30:00Z" });
    expect((await dateOf("anna", "Europe/Berlin"))?.date).toBe("2026-10-03");
    expect((await dateOf("anna", "UTC"))?.date).toBe("2026-10-02");
    expect((await dateOf("anna", "America/Los_Angeles"))?.date).toBe("2026-10-02");
  });

  it("US-POK-07 without both the date is unknown, never guessed (P-08)", async () => {
    await add("anna", { caughtAt: null, createdAt: null });
    expect(await dateOf("anna")).toEqual({ date: null, source: "unknown" });
  });

  it("US-POK-07 an unreadable creation moment is unknown, not a guess", async () => {
    await add("anna", { caughtAt: null, createdAt: "not a date" });
    expect(await dateOf("anna")).toEqual({ date: null, source: "unknown" });
  });
});

describe("US-POK-07 catch date: earliest across all specimens of the species", () => {
  it("US-POK-07 the earliest of several active specimens wins, also across cultivar chips", async () => {
    await add("anna", { caughtAt: "2026-05-01", createdAt: null });
    await add("anna", { caughtAt: "2026-02-10", createdAt: null, speciesId: LEMON_B });
    await add("anna", { caughtAt: "2026-07-01", createdAt: null });
    expect(await dateOf("anna")).toEqual({ date: "2026-02-10", source: "caught_at" });
  });

  it("US-POK-07 an archived specimen still counts for the date, as long as an active one keeps the species", async () => {
    await add("anna", { caughtAt: "2025-01-15", createdAt: null, archived: true });
    await add("anna", { caughtAt: "2026-04-01", createdAt: null });
    expect(await dateOf("anna")).toEqual({ date: "2025-01-15", source: "caught_at" });
  });

  it("US-POK-07 a species with only archived specimens is not caught and has no date", async () => {
    await add("anna", { caughtAt: "2025-01-15", createdAt: null, archived: true });
    expect((await pokedexOwnership(deps(), "anna", "Europe/Berlin")).caught).toEqual([]);
  });

  it("US-POK-07 an earlier approximate date beats a later exact one and stays marked approximate", async () => {
    await add("anna", { caughtAt: "2026-06-01", createdAt: null });
    await add("anna", { caughtAt: null, createdAt: "2026-01-20T12:00:00Z" });
    expect(await dateOf("anna")).toEqual({ date: "2026-01-20", source: "created_at" });
  });

  it("US-POK-07 a specimen with unknown date does not hide the known date of another", async () => {
    await add("anna", { caughtAt: null, createdAt: null });
    await add("anna", { caughtAt: "2026-06-01", createdAt: null });
    expect(await dateOf("anna")).toEqual({ date: "2026-06-01", source: "caught_at" });
  });

  it("US-POK-07 foreign specimens never influence the date (P-04)", async () => {
    await add("ben", { caughtAt: "2020-01-01", createdAt: null });
    await add("anna", { caughtAt: "2026-06-01", createdAt: null });
    expect(await dateOf("anna")).toEqual({ date: "2026-06-01", source: "caught_at" });
  });
});

describe("US-POK-07 catch date of a back-dated specimen (FR-BES-04)", () => {
  it("US-POK-07 a specimen created with a back-dated catch date drives the exact catch date, not the creation date", async () => {
    const created = await execute(
      specimenCreate({
        specimens,
        species,
        targetLocation: NO_TARGET_LOCATION,
        clock: () => new Date("2026-10-02T12:00:00Z"),
      }),
      { idempotency: new InMemoryIdempotencyStore() },
      {
        context: { userId: "anna" },
        input: { speciesId: LEMON, timeZone: "Europe/Berlin", catchDate: "2022-02-03" },
        idempotencyKey: "backdate",
      },
    );
    expect(created.ok).toBe(true);
    expect(await dateOf("anna")).toEqual({ date: "2022-02-03", source: "caught_at" });
  });
});

describe("US-POK-07 catch date at the clock changes and local midnight (NFR-08, QG-D4)", () => {
  // Berlin switches to summer time at 2026-03-29 01:00 UTC and back at 2026-10-25 01:00 UTC. The creation instant
  // decides the local calendar date: not the UTC date, not a 24-hour block around the switch.
  it.each([
    ["2026-03-28T22:59:59Z", "2026-03-28"], // 23:59:59 CET, the day before the switch
    ["2026-03-28T23:00:00Z", "2026-03-29"], // 00:00 CET, local midnight of the switch day
    ["2026-03-29T00:59:59Z", "2026-03-29"], // 01:59:59 CET, just before the switch
    ["2026-03-29T01:00:00Z", "2026-03-29"], // 03:00 CEST, just after the switch
    ["2026-03-29T21:59:59Z", "2026-03-29"], // 23:59:59 CEST, the switch day is one calendar day
    ["2026-03-29T22:00:00Z", "2026-03-30"], // 00:00 CEST, local midnight after the switch
    ["2026-06-14T21:59:59Z", "2026-06-14"], // 23:59:59 CEST, an ordinary day near midnight
    ["2026-06-14T22:00:00Z", "2026-06-15"], // 00:00 CEST, the next local day
    ["2026-10-24T21:59:59Z", "2026-10-24"], // 23:59:59 CEST, the day before the switch back
    ["2026-10-24T22:00:00Z", "2026-10-25"], // 00:00 CEST, local midnight of the switch day
    ["2026-10-25T00:59:59Z", "2026-10-25"], // 02:59:59 CEST, just before the switch back
    ["2026-10-25T01:00:00Z", "2026-10-25"], // 02:00 CET, just after the switch back
    ["2026-10-25T22:59:59Z", "2026-10-25"], // 23:59:59 CET, the switch day is one calendar day
    ["2026-10-25T23:00:00Z", "2026-10-26"], // 00:00 CET, local midnight after the switch back
  ])("US-POK-07 the creation instant %s is the Berlin date %s", async (instant, local) => {
    await add("anna", { caughtAt: null, createdAt: instant });
    expect(await dateOf("anna", "Europe/Berlin")).toEqual({ date: local, source: "created_at" });
  });
});

describe("US-BES-11 the Pokédex follows a corrected catch date (US-POK-07)", () => {
  // Test-only port over the in-memory rows; the derived Pokédex date is never stored (P-01).
  const catchDates: CatchDateStore = {
    setCaughtAt: async (userId, id, date) => {
      const i = specimens.rows.findIndex((z) => z.userId === userId && z.id === id);
      const row = specimens.rows[i];
      if (!row) return "not_found";
      specimens.rows[i] = { ...row, caughtAt: date };
      return { ...row, caughtAt: date };
    },
  };
  const correct = (id: string, catchDate: string) =>
    execute(
      specimenCorrectCatchDate({
        specimens: catchDates,
        clock: () => new Date("2026-10-02T12:00:00Z"),
      }),
      { idempotency: new InMemoryIdempotencyStore() },
      {
        context: { userId: "anna" },
        input: { specimenId: id, timeZone: "Europe/Berlin", catchDate },
        idempotencyKey: `correct-${id}-${catchDate}`,
      },
    );

  it("US-BES-11 correcting the catch date of the only specimen changes the catch date of the species", async () => {
    await add("anna", { caughtAt: "2026-09-01", createdAt: "2026-09-01T10:00:00Z" });
    const id = specimens.rows[0]?.id ?? "";
    expect((await correct(id, "2021-04-12")).ok).toBe(true);
    expect(await dateOf("anna")).toEqual({ date: "2021-04-12", source: "caught_at" });
  });

  it("US-BES-11 moving the earliest specimen later lets the next earliest one decide (derived, not stored)", async () => {
    await add("anna", { caughtAt: "2020-01-01", createdAt: null });
    await add("anna", { caughtAt: "2023-06-01", createdAt: null });
    const first = specimens.rows[0]?.id ?? "";
    expect((await correct(first, "2025-03-03")).ok).toBe(true);
    expect(await dateOf("anna")).toEqual({ date: "2023-06-01", source: "caught_at" });
  });
});
