import { describe, expect, it } from "vitest";
import { ALL_FEATURES, NO_FEATURES } from "../../../../kernel";
import { execute } from "../../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import { onboardingUnlockFunction, type ManualUnlock, type ManualUnlockStore } from "./index";

class InMemoryUnlocks implements ManualUnlockStore {
  readonly rows = new Map<string, ManualUnlock[]>();
  async list(userId: string) {
    return this.rows.get(userId) ?? [];
  }
  async add(userId: string, id: string, unlockedOn: string) {
    const own = this.rows.get(userId) ?? [];
    const kept = own.find((r) => r.id === id);
    if (kept) return kept;
    const row = { id, unlockedOn };
    this.rows.set(userId, [...own, row]);
    return row;
  }
}

const setup = (features = ALL_FEATURES) => {
  const unlocks = new InMemoryUnlocks();
  const idempotency = new InMemoryIdempotencyStore();
  const op = onboardingUnlockFunction({ unlocks, features: async () => features });
  let n = 0;
  const run = (userId: string, input: unknown) =>
    execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: `k${++n}` });
  return { unlocks, run };
};

describe("US-ONB-05 unlock by tap", () => {
  it("US-ONB-05 stores the unlock with the local date of the tap, even when the rule is not met", async () => {
    const { unlocks, run } = setup();
    expect(await run("anna", { id: "anniversaries", on: "2026-10-18" })).toMatchObject({
      ok: true,
      value: { id: "anniversaries", unlockedOn: "2026-10-18" },
    });
    expect(await unlocks.list("anna")).toHaveLength(1);
  });

  it("US-ONB-05 a second tap changes nothing, the first date stays (never revoked, P-10)", async () => {
    const { unlocks, run } = setup();
    await run("anna", { id: "wishlist", on: "2026-10-18" });
    expect(await run("anna", { id: "wishlist", on: "2026-11-01" })).toMatchObject({
      ok: true,
      value: { unlockedOn: "2026-10-18" },
    });
    expect(await unlocks.list("anna")).toHaveLength(1);
  });

  it("US-ONB-05 an unknown function is refused with a stable code and nothing is written", async () => {
    const { unlocks, run } = setup();
    expect(await run("anna", { id: "nonsense", on: "2026-10-18" })).toMatchObject({
      ok: false,
      error: { code: "onboarding.unknown_function" },
    });
    expect(await unlocks.list("anna")).toEqual([]);
  });

  it.each([
    ["friends", "social"],
    ["equipment", "recommendations"],
  ])("US-ONB-05 %s cannot be unlocked while the switch %s is off (FR-ONB-03)", async (id) => {
    const { unlocks, run } = setup(NO_FEATURES);
    expect(await run("anna", { id, on: "2026-10-18" })).toMatchObject({
      ok: false,
      error: { code: "onboarding.unknown_function" },
    });
    expect(await unlocks.list("anna")).toEqual([]);
  });

  it("US-ONB-05 invalid input (no date, bad date) is refused", async () => {
    const { run } = setup();
    for (const bad of [{ id: "wishlist" }, { id: "wishlist", on: "2026-02-30" }, {}, { id: 3 }]) {
      expect(await run("anna", bad)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
  });

  it("US-ONB-05 the unlock belongs to the account of the caller (P-04)", async () => {
    const { unlocks, run } = setup();
    await run("anna", { id: "wishlist", on: "2026-10-18" });
    expect(await unlocks.list("ben")).toEqual([]);
  });
});
