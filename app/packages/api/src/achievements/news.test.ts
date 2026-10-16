import { ACHIEVEMENT_IDS, type AchievementSeenState } from "@pflanzendex/core";
import { describe, expect, it } from "vitest";
import type { FactSources } from "./facts";
import { achievementsNews, earnedAchievementIds } from "./news";
import { achievementsView } from "./view";

// US-ACH-03: new = earned minus seen, derived from the own data (fakes, no database).
const NOW = new Date("2026-07-10T10:00:00Z");
const sources = (): FactSources =>
  ({
    specimens: {
      list: async () => [
        {
          id: "a",
          speciesId: "sp1",
          name: "Aloe a",
          caughtAt: "2025-10-01",
          archivedAt: null,
          repottedAt: "2026-05-04",
        },
      ],
    },
    species: { find: async () => null, findMany: async () => [null] },
    profiles: { list: async () => [] },
    treatments: { open: async () => new Map(), done: async () => [] },
    measurements: { list: async () => [] },
    swaps: { list: async () => [] },
  }) as unknown as FactSources;
const KEEPER = { userId: "anna", timeZone: "Europe/Berlin", now: NOW };
const ALL = [...ACHIEVEMENT_IDS];
const store = (state: AchievementSeenState | null) => ({ find: async () => state });

describe("US-ACH-03 news of the achievements", () => {
  it("US-ACH-03 lists the ids of what is earned", async () => {
    expect(await earnedAchievementIds(sources(), "anna", "Europe/Berlin", NOW)).toEqual([
      "cutting-rooted",
    ]);
  });

  it("US-ACH-03 first evaluation: nothing is new, what is earned is to be acknowledged silently", async () => {
    const r = await achievementsNews(sources(), store(null), KEEPER);
    expect(r).toEqual({
      calmMode: false,
      fresh: [],
      acknowledge: ["cutting-rooted"],
      needsWrite: true,
    });
  });

  it("US-ACH-03 an earned, unseen achievement is new with its date and specimen", async () => {
    const r = await achievementsNews(sources(), store({ seen: [], known: ALL }), KEEPER);
    expect(r).toEqual({
      calmMode: false,
      fresh: [{ id: "cutting-rooted", earnedOn: "2026-05-04", specimenName: "Aloe a" }],
      acknowledge: [],
      needsWrite: false,
    });
  });

  it("US-ACH-03 a seen achievement is not new any more", async () => {
    const r = await achievementsNews(
      sources(),
      store({ seen: ["cutting-rooted"], known: ALL }),
      KEEPER,
    );
    expect(r.fresh).toEqual([]);
  });

  it("US-ACH-03 the overview marks the new ones and counts them; nothing is new before the state exists", async () => {
    const seen = async (state: AchievementSeenState | null) =>
      achievementsView(sources(), state, KEEPER);
    const flags = (v: Awaited<ReturnType<typeof seen>>) =>
      v.groups.flatMap((g) => g.earned.map((i) => i.isNew));
    const fresh = await seen({ seen: [], known: ALL });
    expect(fresh.newCount).toBe(1);
    expect(flags(fresh)).toEqual([true]);
    const none = await seen(null);
    expect(none.newCount).toBe(0);
    expect(flags(none)).toEqual([false]);
  });
});
