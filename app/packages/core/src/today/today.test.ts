import { describe, expect, it } from "vitest";
import { todayStatus } from "./index";
import type { SpecimenRow } from "../collection";
import type { LightLocationStore } from "../light";
import { InMemoryTreatments } from "../care/treatment-data/treatment-test-helpers";
import { InMemoryCareProfiles } from "../collection/care-profile/care-profile-test-helpers";
import { SpeciesStub, testSpecies } from "../collection/shared/test-helpers";
import { PhaseLocationStub } from "../care/shared/test-helpers";
import type { CardMeasurementView } from "../collection";
import type { WishRow, ZoneStock } from "../wishlist";

const WINTER = "11111111-1111-4111-8111-111111111111"; // dormancy 11-01 to 03-15
const SUMMER = "22222222-2222-4222-8222-222222222222"; // dormancy 06-01 to 08-31
const SOLL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ELSEWHERE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// 2026-10-02 23:30 UTC is already 2026-10-03 in Berlin (NFR-08): growth phase for WINTER, growth for SUMMER.
const clock = () => new Date("2026-10-02T23:30:00Z");

const row = (id: string, name: string, extra: Partial<SpecimenRow> = {}): SpecimenRow => ({
  id,
  speciesId: SUMMER,
  name,
  marker: null,
  locationId: SOLL,
  status: "plant",
  caughtAt: "2026-10-01",
  createdAt: "2026-10-01T10:00:00Z",
  archivedAt: null,
  archivedReason: null,
  ...extra,
});

const locations: LightLocationStore = {
  list: async (u) =>
    u === "anna"
      ? [
          { id: SOLL, name: "Fenster", lightZoneId: "z2", kind: "indoor" },
          { id: ELSEWHERE, name: "Flur", lightZoneId: null, kind: "indoor" },
        ]
      : [],
  create: async () => "name_taken",
  update: async () => "not_found",
};

/** What `care` and `wishlist` deliver for a test: last measurement per specimen, open wishes, stock per zone 2 to 4. */
interface Extra {
  readonly measured?: Readonly<Record<string, CardMeasurementView["last"]["quality"]>>;
  readonly wishes?: readonly Pick<WishRow, "targetZoneId">[];
  readonly stock?: readonly ZoneStock[];
  /** The buffer of the account (US-WUN-02); without it the default applies. */
  readonly buffer?: number;
}
const asked: string[][] = [];

async function setUp(
  rows: readonly SpecimenRow[],
  plan: [string, string, string][] = [],
  extra: Extra = {},
) {
  const treatments = new InMemoryTreatments({ anna: rows.map((r) => r.id), ben: ["e9"] });
  for (const [specimenId, dueAt, reason] of plan)
    await treatments.createMany("anna", [
      { specimenId, reason, agent: null, dueAt, courseId: null },
    ]);
  await treatments.createMany("ben", [
    { specimenId: "e9", reason: "Fremd", agent: null, dueAt: "2026-09-01", courseId: null },
  ]);
  const own: Record<string, readonly SpecimenRow[]> = { anna: rows, ben: [row("e9", "Fremd")] };
  const species = new SpeciesStub([
    {
      species: testSpecies(WINTER, {
        germanName: "Bogenhanf",
        dormancyFrom: "11-01",
        dormancyUntil: "03-15",
      }),
    },
    {
      species: testSpecies(SUMMER, {
        germanName: "Aloe",
        dormancyFrom: "06-01",
        dormancyUntil: "08-31",
      }),
    },
  ]);
  const deps = {
    specimens: { list: async (u: string) => own[u] ?? [] },
    species,
    locations,
    treatments,
    profiles: new InMemoryCareProfiles(),
    // Growth phase of both species is today's phase; the target of the growth phase is the location SOLL.
    targets: new PhaseLocationStub({
      anna: { [WINTER]: { growth: SOLL }, [SUMMER]: { growth: SOLL } },
    }),
    clock,
    measurements: {
      forSpecimens: async (_u: string, ids: readonly string[]) => {
        asked.push([...ids]);
        return new Map(
          ids.flatMap((id) => {
            const quality = extra.measured?.[id];
            if (!quality) return [];
            const last = { date: "2026-10-01", value: 12, quality, note: null };
            return [[id, { last, photo: null }] as const];
          }),
        );
      },
    },
    wishes: { open: async () => (extra.wishes ?? []) as readonly WishRow[] },
    stock: {
      stock: async () => extra.stock ?? [],
      ...(extra.buffer === undefined ? {} : { buffer: async () => extra.buffer as number }),
    },
  };
  return (zone: unknown = "Europe/Berlin", user = "anna") => todayStatus(deps, user, zone);
}

const kinds = (r: Awaited<ReturnType<Awaited<ReturnType<typeof setUp>>>>) =>
  r.ok ? r.value.items.map((i) => `${i.kind}:${i.specimenName}`) : [];

describe("TE-07 US-BEH-02 treatments in the today list", () => {
  it("TE-07 US-BEH-02 lists overdue and due-today treatments, most overdue first, each with a next action", async () => {
    const today = await setUp(
      [row("e1", "Bogenhanf"), row("e2", "Aloe")],
      [
        ["e1", "2026-10-03", "Spinnmilben"],
        ["e2", "2026-10-01", "Wollläuse"],
      ],
    );
    const r = await today();
    expect(kinds(r)).toEqual(["treatment_overdue:Aloe", "treatment_due:Bogenhanf"]);
    if (!r.ok) throw new Error("failed");
    expect(r.value.date).toBe("2026-10-03");
    expect(r.value.items[0]?.text).toContain("überfällig seit 2 Tagen");
    expect(r.value.items[1]?.text).toContain("heute fällig");
    for (const item of r.value.items) expect(item.nextAction.length).toBeGreaterThan(0);
    expect(r.value.items[0]?.target).toBe("treatments");
  });

  it("TE-07 US-BEH-02 counts later treatments instead of dropping them silently (P-10)", async () => {
    const today = await setUp(
      [row("e1", "Bogenhanf")],
      [
        ["e1", "2026-10-05", "A"],
        ["e1", "2026-11-20", "B"],
      ],
    );
    const r = await today();
    expect(kinds(r)).toEqual([]);
    expect(r.ok && r.value.upcoming).toBe(2);
  });

  it("TE-07 US-BES-07 archived specimens and foreign treatments never appear (P-04)", async () => {
    const today = await setUp(
      [row("e1", "Alt", { status: "archived", archivedAt: "2026-10-02", archivedReason: "x" })],
      [["e1", "2026-09-01", "Alt"]],
    );
    expect(kinds(await today())).toEqual([]);
  });

  it("TE-07 NFR-08 'today' is the local date of the time zone, not the UTC date", async () => {
    const today = await setUp([row("e1", "Aloe")], [["e1", "2026-10-03", "Heute"]]);
    expect(kinds(await today("Europe/Berlin"))).toEqual(["treatment_due:Aloe"]);
    const r = await today("Pacific/Honolulu"); // still 2026-10-02 there
    expect(kinds(r)).toEqual([]);
    expect(r.ok && r.value.date).toBe("2026-10-02");
  });

  it("TE-07 NFR-08 an unknown time zone is refused with input.invalid", async () => {
    const today = await setUp([]);
    const r = await today("Mars/Olympus");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("input.invalid");
  });
});

describe("TE-07 US-PHA-02 phase deviations in the today list", () => {
  it("TE-07 US-PHA-02 lists a specimen away from the target location of its phase with the action", async () => {
    const today = await setUp([
      row("e1", "Bogenhanf", { speciesId: WINTER, locationId: ELSEWHERE }),
    ]);
    const r = await today();
    expect(kinds(r)).toContain("phase_deviation:Bogenhanf");
    if (!r.ok) throw new Error("failed");
    const item = r.value.items.find((i) => i.kind === "phase_deviation");
    expect(item?.target).toBe("care_phases");
    expect(item?.nextAction).toContain("Jetzt umgestellt");
  });

  it("TE-07 US-PHA-02 a specimen at the target, or with unknown target, is no deviation (P-08)", async () => {
    const today = await setUp([row("e1", "Aloe"), row("e2", "Bogenhanf", { speciesId: WINTER })]);
    expect(kinds(await today())).toEqual([]);
  });
});

describe("TE-07 US-BES-08 incomplete data in the today list", () => {
  it("TE-07 US-BES-08 names a specimen without location once, as incomplete data", async () => {
    const today = await setUp([row("e1", "Aloe", { locationId: null })]);
    const r = await today();
    expect(kinds(r)).toEqual(["specimen_incomplete:Aloe"]);
    if (!r.ok) throw new Error("failed");
    expect(r.value.items[0]?.target).toBe("hints");
    expect(r.value.items[0]?.nextAction).toContain("Standort");
  });

  it("TE-07 US-BES-08 a location without light zone is named too", async () => {
    const today = await setUp([row("e1", "Aloe", { locationId: ELSEWHERE })]);
    expect(kinds(await today())).toContain("specimen_incomplete:Aloe");
  });
});

describe("TE-07 priority and order", () => {
  it("TE-07 orders overdue, due today, deviation, incomplete data; the same ids on every call (R-04)", async () => {
    const today = await setUp(
      [
        row("e1", "Zeder", { locationId: null }),
        row("e2", "Aloe"),
        row("e3", "Bogenhanf", { speciesId: WINTER, locationId: ELSEWHERE }),
        row("e4", "Efeu"),
      ],
      [
        ["e2", "2026-10-03", "Heute"],
        ["e4", "2026-10-02", "Gestern"],
      ],
    );
    const first = await today();
    expect(kinds(first)).toEqual([
      "treatment_overdue:Efeu",
      "treatment_due:Aloe",
      "phase_deviation:Bogenhanf",
      "specimen_incomplete:Bogenhanf",
      "specimen_incomplete:Zeder",
    ]);
    expect(await today()).toEqual(first);
  });

  it("TE-07 P-10 a keeper with nothing due gets an empty list with the date, not an error", async () => {
    const today = await setUp([row("e1", "Aloe")]);
    const r = await today();
    expect(r.ok && r.value.items).toEqual([]);
  });
});

describe("US-QS-04 deviations become visible in the today list", () => {
  it("US-QS-04 an etiolated last measurement appears as a warning with an instruction for action", async () => {
    const today = await setUp([row("e1", "Aloe"), row("e2", "Efeu")], [], {
      measured: { e1: "etiolated", e2: "healthy" },
    });
    const r = await today();
    expect(kinds(r)).toEqual(["measurement_etiolated:Aloe"]);
    if (!r.ok) throw new Error("failed");
    const item = r.value.items[0];
    expect(item).toMatchObject({ id: "etiolated:e1", specimenId: "e1", target: "measurements" });
    expect(item?.text).toBe("„Aloe“: Die letzte Messung vom 01.10.2026 ist vergeilt/dünn.");
    expect(item?.nextAction.length).toBeGreaterThan(0);
  });

  it("US-QS-04 US-BES-07 the measurements of archived specimens are not asked for and never warned about", async () => {
    asked.length = 0;
    const archived = { status: "archived" as const, archivedAt: "2026-10-02", archivedReason: "x" };
    const today = await setUp([row("e1", "Alt", archived), row("e2", "Aloe")], [], {
      measured: { e1: "etiolated" },
    });
    expect(kinds(await today())).toEqual([]);
    expect(asked.flat()).not.toContain("e1");
  });

  it("US-QS-04 US-WUN-02 a zone below the buffer of open candidates appears with the action of the wishlist", async () => {
    const stock = [
      { zoneId: "z2", name: "Lampe 2", count: 3 },
      { zoneId: "z3", name: "Lampe 3", count: 1 },
    ];
    const wishes = [{ targetZoneId: "z2" }, { targetZoneId: "z2" }, { targetZoneId: "z3" }];
    const today = await setUp([row("e1", "Aloe")], [], { stock, wishes });
    const r = await today();
    expect(kinds(r)).toEqual(["buffer_low:null"]);
    if (!r.ok) throw new Error("failed");
    expect(r.value.items[0]).toMatchObject({
      id: "buffer:z3",
      specimenId: null,
      specimenName: null,
      text: "Nachschub nötig: Lampe 3 (1 offener Kandidat)",
      target: "wishlist",
    });
    expect(r.value.items[0]?.nextAction).toContain("Lampe 3");
  });

  it("US-QS-04 with enough open candidates in every zone there is no buffer warning", async () => {
    const stock = [{ zoneId: "z2", name: "Lampe 2", count: 0 }];
    const today = await setUp([], [], {
      stock,
      wishes: [{ targetZoneId: "z2" }, { targetZoneId: "z2" }],
    });
    expect(kinds(await today())).toEqual([]);
  });

  it("US-WUN-02 the Today list uses the buffer of the account at once: a higher value warns, a lower one does not", async () => {
    const stock = [{ zoneId: "z2", name: "Lampe 2", count: 0 }];
    const wishes = [{ targetZoneId: "z2" }, { targetZoneId: "z2" }];
    const higher = await setUp([], [], { stock, wishes, buffer: 3 });
    expect(kinds(await higher())).toEqual(["buffer_low:null"]);
    const lower = await setUp([], [], { stock, wishes: [{ targetZoneId: "z2" }], buffer: 1 });
    expect(kinds(await lower())).toEqual([]);
    const off = await setUp([], [], { stock, wishes: [], buffer: 0 });
    expect(kinds(await off())).toEqual([]);
  });

  it("US-QS-04 orders date-bound first, then deviation, etiolated, incomplete data, buffer last", async () => {
    const today = await setUp(
      [
        row("e1", "Zeder", { locationId: null }),
        row("e2", "Aloe"),
        row("e3", "Bogenhanf", { speciesId: WINTER, locationId: ELSEWHERE }),
      ],
      [["e2", "2026-10-03", "Heute"]],
      { measured: { e2: "etiolated" }, stock: [{ zoneId: "z2", name: "Lampe 2", count: 0 }] },
    );
    expect(kinds(await today())).toEqual([
      "treatment_due:Aloe",
      "phase_deviation:Bogenhanf",
      "measurement_etiolated:Aloe",
      "specimen_incomplete:Bogenhanf",
      "specimen_incomplete:Zeder",
      "buffer_low:null",
    ]);
  });
});
