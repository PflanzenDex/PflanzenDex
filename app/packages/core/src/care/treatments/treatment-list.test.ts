import { describe, expect, it } from "vitest";
import { treatmentOpenList, treatmentStatus } from "../index";
import type { SpecimenRow, SpecimenStore } from "../../collection";
import { InMemoryTreatments } from "../treatment-data/treatment-test-helpers";

const row = (id: string, name: string, status: SpecimenRow["status"] = "plant"): SpecimenRow => ({
  id,
  speciesId: "species-1",
  name,
  marker: null,
  locationId: null,
  status,
  caughtAt: "2026-10-01",
  createdAt: "2026-10-01T10:00:00Z",
  archivedAt: status === "archived" ? "2026-10-02" : null,
  archivedReason: status === "archived" ? "eingegangen" : null,
});
const OWN: Readonly<Record<string, readonly SpecimenRow[]>> = {
  anna: [row("e1", "Bogenhanf"), row("e2", "Aloe"), row("e3", "Alt", "archived")],
  ben: [row("e9", "Fremd")],
};
const specimens: Pick<SpecimenStore, "list"> = { list: async (u) => OWN[u] ?? [] };
// 2026-10-02 23:30 UTC: already 2026-10-03 in Berlin (NFR-08).
const clock = () => new Date("2026-10-02T23:30:00Z");

async function seeded(userId = "anna") {
  const treatments = new InMemoryTreatments({ anna: ["e1", "e2", "e3"], ben: ["e9"] });
  const plan = (
    who: string,
    specimenId: string,
    dueAt: string,
    reason = "Wollläuse",
    agent: string | null = null,
  ) => treatments.createMany(who, [{ specimenId, reason, agent, dueAt, courseId: null }]);
  await plan("anna", "e1", "2026-10-10", "Spinnmilben", "Neemöl");
  await plan("anna", "e2", "2026-10-01");
  await plan("anna", "e2", "2026-10-03");
  await plan("anna", "e1", "2026-10-05");
  await plan("anna", "e3", "2026-09-01", "Archiviert");
  await plan("ben", "e9", "2026-09-01", "Fremd");
  const list = (zone: unknown = "Europe/Berlin") =>
    treatmentOpenList({ specimens, treatments, clock }, userId, zone);
  return { treatments, list };
}

describe("US-BEH-02 status text", () => {
  const today = "2026-10-03";
  it("US-BEH-02 overdue for N day(s), due today, in N days (1 to 3), otherwise the date", () => {
    expect(treatmentStatus("2026-10-02", today)).toEqual({
      kind: "overdue",
      days: 1,
      text: "überfällig seit 1 Tag",
    });
    expect(treatmentStatus("2026-09-30", today)).toEqual({
      kind: "overdue",
      days: 3,
      text: "überfällig seit 3 Tagen",
    });
    expect(treatmentStatus(today, today)).toEqual({
      kind: "today",
      days: 0,
      text: "heute fällig",
    });
    expect(treatmentStatus("2026-10-04", today).text).toBe("in 1 Tag");
    expect(treatmentStatus("2026-10-06", today)).toEqual({
      kind: "soon",
      days: 3,
      text: "in 3 Tagen",
    });
    expect(treatmentStatus("2026-10-07", today)).toEqual({
      kind: "later",
      days: 4,
      text: "07.10.2026",
    });
  });
  it("US-BEH-02 counts calendar days across month and year ends", () => {
    expect(treatmentStatus("2027-01-01", "2026-12-31").text).toBe("in 1 Tag");
    expect(treatmentStatus("2026-12-31", "2027-01-02").text).toBe("überfällig seit 2 Tagen");
  });
});

describe("US-BEH-02 open treatments list", () => {
  it("US-BEH-02 shows plant, reason, agent or null, due date and status, sorted ascending by date", async () => {
    const { list } = await seeded();
    const r = await list();
    expect(
      r.ok && r.value.map((t) => [t.specimenName, t.reason, t.agent, t.dueAt, t.status.text]),
    ).toEqual([
      ["Aloe", "Wollläuse", null, "2026-10-01", "überfällig seit 2 Tagen"],
      ["Aloe", "Wollläuse", null, "2026-10-03", "heute fällig"],
      ["Bogenhanf", "Wollläuse", null, "2026-10-05", "in 2 Tagen"],
      ["Bogenhanf", "Spinnmilben", "Neemöl", "2026-10-10", "10.10.2026"],
    ]);
  });
  it("US-BEH-02 today is the local date of the time zone, not the UTC date (NFR-08)", async () => {
    const { list } = await seeded();
    const berlin = await list("Europe/Berlin");
    const utc = await list("UTC");
    expect(berlin.ok && berlin.value[1]?.status.kind).toBe("today");
    expect(utc.ok && utc.value[1]?.status.kind).toBe("soon");
  });
  it("US-BEH-02 an unknown time zone is refused", async () => {
    const { list } = await seeded();
    const r = await list("Mars/Base");
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
  it("US-BEH-02 leaves out archived specimens and never asks the store for their ids", async () => {
    const { treatments } = await seeded();
    const asked: string[] = [];
    const spy = {
      open: (u: string, ids: readonly string[]) => (asked.push(...ids), treatments.open(u, ids)),
    };
    const r = await treatmentOpenList(
      { specimens, treatments: spy, clock },
      "anna",
      "Europe/Berlin",
    );
    expect(r.ok && r.value.some((t) => t.reason === "Archiviert")).toBe(false);
    expect(asked).not.toContain("e3");
  });
  it("US-BEH-02 shows only the own treatments of an account (two accounts, P-04)", async () => {
    const { list } = await seeded("ben");
    const r = await list();
    expect(r.ok && r.value.map((t) => t.reason)).toEqual(["Fremd"]);
  });
  it("US-BEH-02 an account without open treatments gets an empty list", async () => {
    const treatments = new InMemoryTreatments({});
    const r = await treatmentOpenList({ specimens, treatments, clock }, "nobody", "UTC");
    expect(r.ok && r.value).toEqual([]);
  });
});
