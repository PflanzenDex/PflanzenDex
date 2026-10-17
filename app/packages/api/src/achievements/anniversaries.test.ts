import { describe, expect, it } from "vitest";
import { achievementsAnniversaries } from "./anniversaries";

// US-ACH-06: anniversaries from the own specimens and photos (fakes, no database).
const spec = (
  id: string,
  name: string,
  caughtAt: string | null,
  archivedAt: string | null = null,
) => ({
  id,
  name,
  caughtAt,
  archivedAt,
});
const meas = (id: string, date: string, photo: object | null) => ({ id, date, photo });
const deps = (
  rows: ReturnType<typeof spec>[],
  list: Record<string, ReturnType<typeof meas>[]> = {},
  seen: string[] = [],
) =>
  ({
    specimens: {
      list: async (u: string) => {
        seen.push(u);
        return rows;
      },
    },
    measurements: { list: async (_u: string, id: string) => list[id] ?? [] },
  }) as unknown as Parameters<typeof achievementsAnniversaries>[0];
// 2026-04-10 22:30 UTC is already 11 April in Berlin (NFR-08).
const NOW = new Date("2026-04-10T22:30:00Z");
const PHOTO = { mime: "image/jpeg" };

describe("US-ACH-06 anniversaries through the API logic", () => {
  it("US-ACH-06 answers the anniversary with the first and the latest photo", async () => {
    const r = await achievementsAnniversaries(
      deps([spec("s1", "Aloe", "2025-04-11")], {
        s1: [
          meas("m3", "2026-03-01", PHOTO),
          meas("m2", "2025-05-01", null),
          meas("m1", "2025-04-12", PHOTO),
        ],
      }),
      "anna",
      "Europe/Berlin",
      NOW,
    );
    expect(r).toEqual({
      calmMode: false,
      items: [
        {
          specimenId: "s1",
          name: "Aloe",
          months: 12,
          date: "2026-04-11",
          caughtOn: "2025-04-11",
          first: { url: "/specimens/s1/measurements/m1/photo", date: "2025-04-12" },
          latest: { url: "/specimens/s1/measurements/m3/photo", date: "2026-03-01" },
        },
      ],
    });
  });

  it("US-ACH-06 the local date decides, not UTC (NFR-08)", async () => {
    const rows = [spec("s1", "Aloe", "2025-04-11")];
    expect(
      (await achievementsAnniversaries(deps(rows), "anna", "Europe/Berlin", NOW)).items,
    ).toHaveLength(1);
    expect((await achievementsAnniversaries(deps(rows), "anna", "UTC", NOW)).items).toEqual([]);
  });

  it("US-ACH-06 without photos or with one photo: no invented images", async () => {
    const rows = [spec("s1", "Aloe", "2025-04-10")];
    const none = await achievementsAnniversaries(deps(rows), "anna", "UTC", NOW);
    expect(none.items[0]).toMatchObject({ first: null, latest: null });
    const one = await achievementsAnniversaries(
      deps(rows, { s1: [meas("m1", "2025-05-01", PHOTO)] }),
      "anna",
      "UTC",
      NOW,
    );
    expect(one.items[0]).toMatchObject({ first: { date: "2025-05-01" }, latest: null });
  });

  it("US-ACH-06 no catch date or an archived specimen: no anniversary (P-08); only the own account is read (P-04)", async () => {
    const seen: string[] = [];
    const r = await achievementsAnniversaries(
      deps([spec("a", "A", null), spec("b", "B", "2025-04-10", "2026-01-01")], {}, seen),
      "anna",
      "UTC",
      NOW,
    );
    expect(r.items).toEqual([]);
    expect(seen).toEqual(["anna"]);
  });
});
