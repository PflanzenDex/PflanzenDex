import { describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  ACHIEVEMENT_IDS,
  achievementsMarkSeen,
  reconcileSeen,
  type AchievementSeenState,
  type AchievementSeenStore,
} from "../index";

const ALL = [...ACHIEVEMENT_IDS];

class InMemorySeen implements AchievementSeenStore {
  readonly rows = new Map<string, AchievementSeenState>();
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async add(userId: string, ids: readonly string[], known: readonly string[]) {
    const old = this.rows.get(userId);
    const next = {
      seen: [...new Set([...(old?.seen ?? []), ...ids])],
      known: [...new Set([...(old?.known ?? []), ...known])],
    };
    this.rows.set(userId, next);
    return next;
  }
}

describe("US-ACH-03 new = earned minus seen", () => {
  it("US-ACH-03 the first evaluation creates the state silently: nothing is new, all earned are acknowledged", () => {
    const r = reconcileSeen(["cutting-rooted", "first-handover"], null);
    expect(r).toEqual({
      fresh: [],
      acknowledge: ["cutting-rooted", "first-handover"],
      needsWrite: true,
    });
  });

  it("US-ACH-03 an earned achievement that was not seen is new until it is seen", () => {
    const state = { seen: ["cutting-rooted"], known: ALL };
    const r = reconcileSeen(["cutting-rooted", "first-handover"], state);
    expect(r).toEqual({ fresh: ["first-handover"], acknowledge: [], needsWrite: false });
    expect(reconcileSeen(["cutting-rooted"], state).fresh).toEqual([]);
  });

  it("US-ACH-03 nothing earned means nothing new", () => {
    expect(reconcileSeen([], { seen: [], known: ALL }).fresh).toEqual([]);
  });

  it("US-ACH-03 FR-ACH-09 a definition unknown to the account is acknowledged silently when already met", () => {
    const known = ALL.filter((id) => id !== "first-handover");
    const r = reconcileSeen(["first-handover", "cutting-rooted"], { seen: [], known });
    expect(r.acknowledge).toEqual(["first-handover"]);
    expect(r.fresh).toEqual(["cutting-rooted"]);
    expect(r.needsWrite).toBe(true);
  });

  it("US-ACH-03 FR-ACH-09 a new definition that is not met yet is learned, so it is new when earned later", () => {
    const known = ALL.filter((id) => id !== "first-handover");
    const before = reconcileSeen([], { seen: [], known });
    expect(before).toEqual({ fresh: [], acknowledge: [], needsWrite: true });
    const after = reconcileSeen(["first-handover"], { seen: [], known: ALL });
    expect(after.fresh).toEqual(["first-handover"]);
  });
});

describe("US-ACH-03 achievements.mark_seen", () => {
  const setup = (earned: string[] = ["cutting-rooted", "first-handover"]) => {
    const seen = new InMemorySeen();
    const idempotency = new InMemoryIdempotencyStore();
    let n = 0;
    const op = achievementsMarkSeen({ seen, earned: async () => earned });
    const run = (userId: string, input: unknown) =>
      execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: `k${++n}` });
    return { seen, run };
  };

  it("US-ACH-03 stores the seen ids and learns the current definitions", async () => {
    const { seen, run } = setup();
    const r = await run("anna", { achievements: ["cutting-rooted"], timeZone: "Europe/Berlin" });
    expect(r).toMatchObject({ ok: true, value: { seen: ["cutting-rooted"] } });
    expect(seen.rows.get("anna")?.known).toEqual(ALL);
  });

  it("US-ACH-03 an empty list only creates the state (first evaluation without any achievement)", async () => {
    const { seen, run } = setup([]);
    const r = await run("anna", { achievements: [], timeZone: "UTC" });
    expect(r.ok).toBe(true);
    expect(seen.rows.get("anna")).toEqual({ seen: [], known: ALL });
  });

  it("US-ACH-03 refuses an achievement that is not earned instead of dropping it (P-10)", async () => {
    const { seen, run } = setup(["cutting-rooted"]);
    const r = await run("anna", { achievements: ["first-handover"], timeZone: "UTC" });
    expect(r).toMatchObject({ ok: false, error: { code: "achievements.not_earned" } });
    expect(seen.rows.size).toBe(0);
  });

  it("US-ACH-03 refuses malformed input", async () => {
    const { run } = setup();
    for (const bad of [
      { achievements: "x", timeZone: "UTC" },
      { achievements: [1], timeZone: "UTC" },
      { achievements: [], timeZone: "Mars/Base" },
      { achievements: [] },
    ]) {
      expect(await run("anna", bad)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
  });
});
