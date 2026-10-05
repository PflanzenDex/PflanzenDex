import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { InMemoryLight } from "../../light/test-helpers";
import { TreatmentStub, MeasurementsStub } from "../cards/cards-test-helpers";
import {
  ARCHIVED_REASONS,
  specimenArchived,
  specimenArchive,
  specimenCards,
  specimenLoad,
  specimenRestore,
  specimenList,
} from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../shared/test-helpers";

// US-BES-07: archive a received or given-away plant without losing the history.
const SPECIES = "11111111-1111-4111-8111-111111111111";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
// 2026-10-02 23:30 UTC: already 3 October in Berlin, still 2 October in New York (NFR-08)
const NOW = new Date("2026-10-02T23:30:00Z");

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const species = new SpeciesStub([{ species: testSpecies(SPECIES) }]);

const create = async (userId: string, name: string) => {
  const r = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};
const archive = (
  id: string,
  input: Record<string, unknown> = {},
  context: { userId: string | null } = anna,
) =>
  execute(
    specimenArchive({ specimens, clock: () => NOW }),
    { idempotency: idem },
    {
      context,
      input: { specimenId: id, timeZone: "Europe/Berlin", reason: "eingegangen", ...input },
      idempotencyKey: `k${++counter}`,
    },
  );
const restore = (id: string, context: { userId: string | null } = anna) =>
  execute(
    specimenRestore({ specimens }),
    { idempotency: idem },
    { context, input: { specimenId: id }, idempotencyKey: `k${++counter}` },
  );
const errorCode = (r: Awaited<ReturnType<typeof archive>>) => !r.ok && r.error.code;

beforeEach(() => {
  specimens = new InMemorySpecimens();
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-07 archive: status, date and reason", () => {
  it("sets status archived, archived_on (local date) and archived_reason", async () => {
    const e = await create("anna", "Bogenhanf");
    const r = await archive(e.id, { reason: "eingegangen" });
    expect(r.ok && r.value).toMatchObject({
      id: e.id,
      status: "archived",
      archivedAt: "2026-10-03",
      archivedReason: "eingegangen",
    });
    expect(specimens.rows[0]).toMatchObject({ status: "archived", archivedAt: "2026-10-03" });
  });

  it("US-BES-07, NFR-08: the date is the local calendar date of the time zone, not UTC", async () => {
    const e = await create("anna", "Bogenhanf");
    const r = await archive(e.id, { timeZone: "America/New_York" });
    expect(r.ok && r.value.archivedAt).toBe("2026-10-02");
  });

  it.each([...ARCHIVED_REASONS, "Gegen Nachbars Katze getauscht"])(
    'US-BES-07: the reason "%s" is stored like this',
    async (reason) => {
      const e = await create("anna", "Bogenhanf");
      const r = await archive(e.id, { reason });
      expect(r.ok && r.value.archivedReason).toBe(reason);
    },
  );

  it("US-BES-07: the reason is stripped of whitespace", async () => {
    const e = await create("anna", "Bogenhanf");
    const r = await archive(e.id, { reason: "  verkauft  " });
    expect(r.ok && r.value.archivedReason).toBe("verkauft");
  });

  it.each([
    ["ohne Grund", { reason: undefined }],
    ["mit leerem Grund", { reason: "   " }],
    ["mit zu langem Grund", { reason: "x".repeat(251) }],
    ["without time zone", { timeZone: undefined }],
    ["with unknown time zone", { timeZone: "Mars/Olympus" }],
    ["mit ungültiger Kennung", { specimenId: "pot" }],
  ])("US-BES-07: %s is rejected and writes nothing", async (_n, deviation) => {
    const e = await create("anna", "Bogenhanf");
    const before = specimens.writes;
    const r = await archive(e.id, deviation);
    expect(errorCode(r)).toBe("input.invalid");
    expect(specimens.writes).toBe(before);
    expect(specimens.rows[0]?.status).toBe("plant");
  });

  it("US-BES-07: an already archived specimen keeps date and reason of the first archiving (P-10)", async () => {
    const e = await create("anna", "Bogenhanf");
    await archive(e.id, { reason: "eingegangen" });
    const r = await archive(e.id, { reason: "verkauft", timeZone: "America/New_York" });
    expect(errorCode(r)).toBe("specimen.already_archived");
    expect(specimens.rows[0]).toMatchObject({
      archivedReason: "eingegangen",
      archivedAt: "2026-10-03",
    });
  });

  it("US-BES-07: without sign-in nothing is archived", async () => {
    const e = await create("anna", "Bogenhanf");
    const r = await archive(e.id, {}, { userId: null });
    expect(errorCode(r)).toBe("access.not_signed_in");
    expect(specimens.rows[0]?.status).toBe("plant");
  });
});

describe("US-BES-07 Mandantentrennung (P-04)", () => {
  it("a foreign specimen cannot be archived and looks like an unknown one", async () => {
    const annas = await create("anna", "Annas Topf");
    const foreign = await archive(annas.id, {}, ben);
    const unknown = await archive("99999999-9999-4999-8999-999999999999", {}, ben);
    expect(errorCode(foreign)).toBe("specimen.not_found");
    expect(!foreign.ok && !unknown.ok && foreign.error).toEqual(!unknown.ok ? unknown.error : null);
    expect(specimens.rows[0]).toMatchObject({ status: "plant", archivedAt: null });
  });

  it("a foreign archived specimen cannot be restored", async () => {
    const annas = await create("anna", "Annas Topf");
    await archive(annas.id);
    const r = await restore(annas.id, ben);
    expect(errorCode(r)).toBe("specimen.not_found");
    expect(specimens.rows[0]?.status).toBe("archived");
  });

  it("the archive shows only the own specimens", async () => {
    const annas = await create("anna", "Annas Topf");
    const bens = await create("ben", "Bens Topf");
    await archive(annas.id);
    await archive(bens.id, {}, ben);
    const entries = await specimenArchived({ specimens, species }, "anna");
    expect(entries.map((x) => x.name)).toEqual(["Annas Topf"]);
  });
});

describe("US-BES-07 Wiederherstellen", () => {
  it("restores the status from before and deletes date and reason", async () => {
    const e = await create("anna", "Bogenhanf");
    await archive(e.id);
    const r = await restore(e.id);
    expect(r.ok && r.value).toMatchObject({
      status: "plant",
      archivedAt: null,
      archivedReason: null,
    });
  });

  it("a cutting stays a cutting after restoring", async () => {
    const e = await create("anna", "Steckling");
    Object.assign(specimens.rows[0] ?? {}, { status: "cutting" });
    await archive(e.id);
    const r = await restore(e.id);
    expect(r.ok && r.value.status).toBe("cutting");
  });

  it("a specimen that is not archived cannot be restored", async () => {
    const e = await create("anna", "Bogenhanf");
    expect(errorCode(await restore(e.id))).toBe("specimen.not_archived");
    expect(errorCode(await restore("99999999-9999-4999-8999-999999999999"))).toBe(
      "specimen.not_found",
    );
  });
});

describe("US-BES-07 archived specimens are missing from lists, but stay viewable", () => {
  it("the list of specimens contains no archived one, restoring brings it back", async () => {
    const away = await create("anna", "Weg");
    await create("anna", "Da");
    await archive(away.id);
    expect((await specimenList(specimens, "anna")).map((x) => x.name)).toEqual(["Da"]);
    await restore(away.id);
    expect((await specimenList(specimens, "anna")).map((x) => x.name)).toEqual(["Weg", "Da"]);
  });

  it("the single specimen stays loadable with history (date and reason visible)", async () => {
    const e = await create("anna", "Bogenhanf");
    await archive(e.id, { reason: "abgegeben" });
    expect(await specimenLoad(specimens, "anna", e.id)).toMatchObject({
      status: "archived",
      archivedReason: "abgegeben",
      caughtAt: "2026-09-01",
    });
  });

  it("the archive names name, species, date and reason, the most recently archived first", async () => {
    const a = await create("anna", "Alt");
    const b = await create("anna", "Neu");
    await archive(a.id, { reason: "eingegangen", timeZone: "America/New_York" });
    await archive(b.id, { reason: "verschenkt" });
    expect(await specimenArchived({ specimens, species }, "anna")).toEqual([
      {
        id: b.id,
        name: "Neu",
        speciesName: "Bogenhanf",
        caughtAt: "2026-09-01",
        archivedAt: "2026-10-03",
        archivedReason: "verschenkt",
      },
      expect.objectContaining({ id: a.id, archivedAt: "2026-10-02" }),
    ]);
  });

  it("US-BES-06: cards hide archived specimens and do not ask the ports about them", async () => {
    const away = await create("anna", "Weg");
    const da = await create("anna", "Da");
    await archive(away.id);
    const light = new InMemoryLight();
    const measurements = new MeasurementsStub({});
    const treatments = new TreatmentStub({});
    const cards = await specimenCards(
      {
        specimens,
        species,
        locations: light.locationAdapter(),
        zones: light.zoneAdapter(),
        measurements,
        treatments,
      },
      "anna",
      "2026-10-03",
    );
    expect(cards.map((k) => k.id)).toEqual([da.id]);
    expect(measurements.calls[0]?.ids).toEqual([da.id]);
    expect(treatments.calls[0]?.ids).toEqual([da.id]);
  });
});
