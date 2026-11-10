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
const meas = (id: string, date: string, photo: string | null) => ({ id, date, photo });
// Every read of the measurements is recorded in `reads` with the IDs it asked for (NFR-12). `listMany` is the port; the
// per-specimen `list` is recorded too, so a return to it fails the count test with the number of reads, not a TypeError.
const deps = (
  rows: ReturnType<typeof spec>[],
  list: Record<string, ReturnType<typeof meas>[]> = {},
  seen: string[] = [],
  reads: string[][] = [],
) =>
  ({
    specimens: {
      list: async (u: string) => {
        seen.push(u);
        return rows;
      },
    },
    measurements: {
      listMany: async (_u: string, ids: readonly string[]) => {
        reads.push([...ids]);
        return new Map(
          ids
            .filter((id) => (list[id] ?? []).length > 0)
            .map((id) => [id, list[id] ?? []] as const),
        );
      },
      list: async (_u: string, id: string) => {
        reads.push([id]);
        return list[id] ?? [];
      },
    },
  }) as unknown as Parameters<typeof achievementsAnniversaries>[0];
// 2026-04-10 22:30 UTC is already 11 April in Berlin (NFR-08).
const NOW = new Date("2026-04-10T22:30:00Z");

describe("US-ACH-06 anniversaries through the API logic", () => {
  it("US-ACH-06 answers the anniversary with the first and the latest photo", async () => {
    const r = await achievementsAnniversaries(
      deps([spec("s1", "Aloe", "2025-04-11")], {
        s1: [
          meas("m3", "2026-03-01", "p3.webp"),
          meas("m2", "2025-05-01", null),
          meas("m1", "2025-04-12", "p1.webp"),
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
          first: { url: "/specimens/s1/measurements/m1/photo?v=p1", date: "2025-04-12" },
          latest: { url: "/specimens/s1/measurements/m3/photo?v=p3", date: "2026-03-01" },
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
      deps(rows, { s1: [meas("m1", "2025-05-01", "p1.webp")] }),
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

describe("NFR-12 US-ACH-06 a replaced photo has a new address", () => {
  it("NFR-12 US-ACH-06 a replaced photo of an anniversary is addressed by its new version", async () => {
    const rows = [spec("s1", "Aloe", "2025-04-11")];
    const url = async (photo: string) => {
      const r = await achievementsAnniversaries(
        deps(rows, { s1: [meas("m1", "2025-04-12", photo)] }),
        "anna",
        "Europe/Berlin",
        NOW,
      );
      return r.items[0]?.first?.url;
    };
    expect(await url("old.webp")).toBe("/specimens/s1/measurements/m1/photo?v=old");
    expect(await url("new.webp")).toBe("/specimens/s1/measurements/m1/photo?v=new");
  });
});

describe("NFR-12 US-ACH-06 the measurements of a day are read in one go", () => {
  // Five specimens caught on 2025-04-11: each has its first anniversary on 2026-04-11, the day of NOW in Berlin (NFR-08).
  const caught = "2025-04-11";
  const five = [
    spec("s1", "Aloe", caught),
    spec("s2", "Basilikum", caught),
    spec("s3", "Christrose", caught),
    spec("s4", "Drachenbaum", caught),
    spec("s5", "Efeu", caught),
  ];
  // The measurements of each specimen newest first, as `list` and `listMany` answer them.
  const byId = {
    s1: [
      meas("m3", "2026-03-01", "p3.webp"),
      meas("m2", "2025-05-01", null),
      meas("m1", "2025-04-12", "p1.webp"),
    ],
    s2: [meas("m5", "2025-06-01", "p5.webp")],
    // s3 has no measurement at all: it is missing from the answer of `listMany`.
    s4: [meas("m7", "2026-01-05", "p7.webp"), meas("m6", "2025-09-09", "p6.webp")],
    s5: [meas("m9", "2025-12-01", null), meas("m8", "2025-07-07", "p8.webp")],
  };

  it("NFR-12 US-ACH-06 one anniversary and five due on one day each read the measurements once", async () => {
    const oneReads: string[][] = [];
    const one = await achievementsAnniversaries(
      deps(five.slice(0, 1), byId, [], oneReads),
      "anna",
      "Europe/Berlin",
      NOW,
    );
    expect(one.items.map((i) => i.specimenId)).toEqual(["s1"]);
    expect(oneReads).toEqual([["s1"]]);

    const manyReads: string[][] = [];
    const many = await achievementsAnniversaries(
      deps(five, byId, [], manyReads),
      "anna",
      "Europe/Berlin",
      NOW,
    );
    expect(many.items.map((i) => i.specimenId)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(manyReads).toEqual([["s1", "s2", "s3", "s4", "s5"]]);
  });

  it("NFR-12 US-ACH-06 each of five anniversaries keeps the first and the latest photo of its own specimen", async () => {
    const r = await achievementsAnniversaries(deps(five, byId), "anna", "Europe/Berlin", NOW);
    expect(r.items.map((i) => ({ id: i.specimenId, first: i.first, latest: i.latest }))).toEqual([
      {
        id: "s1",
        first: { url: "/specimens/s1/measurements/m1/photo?v=p1", date: "2025-04-12" },
        latest: { url: "/specimens/s1/measurements/m3/photo?v=p3", date: "2026-03-01" },
      },
      {
        id: "s2",
        first: { url: "/specimens/s2/measurements/m5/photo?v=p5", date: "2025-06-01" },
        latest: null,
      },
      { id: "s3", first: null, latest: null },
      {
        id: "s4",
        first: { url: "/specimens/s4/measurements/m6/photo?v=p6", date: "2025-09-09" },
        latest: { url: "/specimens/s4/measurements/m7/photo?v=p7", date: "2026-01-05" },
      },
      {
        id: "s5",
        first: { url: "/specimens/s5/measurements/m8/photo?v=p8", date: "2025-07-07" },
        latest: null,
      },
    ]);
  });

  it("NFR-12 US-ACH-06 a specimen without measurements keeps first and latest null", async () => {
    const reads: string[][] = [];
    const r = await achievementsAnniversaries(
      deps(five.slice(2, 3), byId, [], reads),
      "anna",
      "Europe/Berlin",
      NOW,
    );
    expect(r.items).toMatchObject([{ specimenId: "s3", first: null, latest: null }]);
    expect(reads).toEqual([["s3"]]);
  });

  it("NFR-12 US-ACH-06 no anniversary due: no measurement is read", async () => {
    const reads: string[][] = [];
    const r = await achievementsAnniversaries(
      deps([spec("s1", "Aloe", "2025-04-20"), spec("s2", "Basilikum", null)], byId, [], reads),
      "anna",
      "Europe/Berlin",
      NOW,
    );
    expect(r.items).toEqual([]);
    expect(reads).toEqual([]);
  });
});
