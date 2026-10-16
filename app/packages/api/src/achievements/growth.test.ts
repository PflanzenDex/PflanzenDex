import { describe, expect, it } from "vitest";
import { achievementsGrowth } from "./growth";

// US-ACH-05: growth moments and records of a specimen from its own measurements (fakes, no database).
const ID = "00000000-0000-4000-8000-000000000001";
const row = (id: string, date: string, value: number, quality = "healthy") => ({
  id,
  specimenId: ID,
  date,
  value,
  quality,
  note: null,
  ratedBy: "keeper",
  photo: null,
});
const deps = (rows: ReturnType<typeof row>[], known = true) =>
  ({
    specimens: { find: async (_u: string, id: string) => (known && id === ID ? { id } : null) },
    measurements: { list: async () => [...rows].reverse() },
  }) as unknown as Parameters<typeof achievementsGrowth>[0];

describe("US-ACH-05 growth moments through the API logic", () => {
  it("US-ACH-05 answers the moment of the newest measurement and the ids of the records", async () => {
    const r = await achievementsGrowth(
      deps([row("a", "2025-01-01", 10), row("b", "2025-07-01", 16), row("c", "2026-01-01", 40)]),
      "anna",
      ID,
    );
    expect(r).toMatchObject({
      calmMode: false,
      latest: { kind: "moment", since: "2025-01-01", growth: 30 },
      records: ["c"],
    });
  });

  it("US-ACH-05 an etiolated last measurement: no moment, no record (US-WAC-04)", async () => {
    const r = await achievementsGrowth(
      deps([row("a", "2025-01-01", 10), row("b", "2026-01-01", 60, "etiolated")]),
      "anna",
      ID,
    );
    expect(r).toMatchObject({ latest: { kind: "none" }, records: [] });
  });

  it("US-ACH-05 a slower trend (last interval below the earlier ones): no moment", async () => {
    const r = await achievementsGrowth(
      deps([
        row("a", "2025-01-01", 10),
        row("b", "2025-04-01", 30),
        row("c", "2025-07-01", 50),
        row("d", "2026-01-01", 52),
      ]),
      "anna",
      ID,
    );
    expect(r).toMatchObject({ latest: { kind: "none" } });
  });

  it("US-ACH-05 without measurements the moment is unknown", async () => {
    expect(await achievementsGrowth(deps([]), "anna", ID)).toMatchObject({
      latest: { kind: "unknown" },
      records: [],
    });
  });

  it("US-ACH-05 an unknown or foreign specimen is null (looks the same, P-04)", async () => {
    expect(await achievementsGrowth(deps([], false), "anna", ID)).toBeNull();
    expect(await achievementsGrowth(deps([]), "anna", "not-an-id")).toBeNull();
  });
});
