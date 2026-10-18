import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import type { ManualUnlock, ManualUnlockStore } from "../unlock-open";
import {
  DEFAULT_KEEPER_STYLE,
  onboardingSetStyle,
  readKeeperStyle,
  type KeeperStyleChoice,
  type KeeperStyleStore,
} from "./index";

class Styles implements KeeperStyleStore {
  readonly rows = new Map<string, KeeperStyleChoice>();
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async set(userId: string, style: "few" | "many", chosenOn: string) {
    const row = { style, chosenOn };
    this.rows.set(userId, row);
    return row;
  }
}

class Unlocks implements ManualUnlockStore {
  readonly rows = new Map<string, (ManualUnlock & { source?: string })[]>();
  async list(userId: string) {
    return this.rows.get(userId) ?? [];
  }
  async add(userId: string, id: string, unlockedOn: string, source = "tap") {
    const own = this.rows.get(userId) ?? [];
    const kept = own.find((r) => r.id === id);
    if (kept) return kept;
    const row = { id, unlockedOn, source };
    this.rows.set(userId, [...own, row]);
    return row;
  }
}

const setup = () => {
  const styles = new Styles();
  const unlocks = new Unlocks();
  const idempotency = new InMemoryIdempotencyStore();
  const locked: string[] = ["wishlist", "discover"];
  const op = onboardingSetStyle({
    styles,
    unlocks,
    // Mirrors the real source: under `many` nothing is locked.
    lockedFunctions: async (userId) =>
      (await readKeeperStyle(styles, userId)) === "few" ? locked : [],
  });
  let n = 0;
  const run = (userId: string, input: unknown) =>
    execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: `k${++n}` });
  return { styles, unlocks, run };
};

const input = (style: unknown) => ({ style, on: "2026-10-18", timeZone: "Europe/Berlin" });

describe("US-ONB-03 keeper style", () => {
  it("US-ONB-03 an account without a stored choice counts as few (new accounts start with few)", async () => {
    expect(await readKeeperStyle(new Styles(), "anna")).toBe(DEFAULT_KEEPER_STYLE);
    expect(DEFAULT_KEEPER_STYLE).toBe("few");
  });

  it("US-ONB-03 stores the choice with the local date, and the style can be changed at any time", async () => {
    const { styles, run } = setup();
    expect(await run("anna", input("few"))).toMatchObject({
      ok: true,
      value: { style: "few", chosenOn: "2026-10-18" },
    });
    await run("anna", input("many"));
    expect(await readKeeperStyle(styles, "anna")).toBe("many");
  });

  it("US-ONB-03 from few to many the locked functions open with the switch date", async () => {
    const { unlocks, run } = setup();
    await run("anna", input("many"));
    expect(await unlocks.list("anna")).toEqual([
      { id: "wishlist", unlockedOn: "2026-10-18", source: "style_many" },
      { id: "discover", unlockedOn: "2026-10-18", source: "style_many" },
    ]);
  });

  it("US-ONB-03 from many back to few nothing that was opened is taken away (P-10)", async () => {
    const { unlocks, run } = setup();
    await run("anna", input("many"));
    await run("anna", { ...input("few"), on: "2026-11-01" });
    expect(await unlocks.list("anna")).toHaveLength(2);
    expect((await unlocks.list("anna"))[0]?.unlockedOn).toBe("2026-10-18");
  });

  it("US-ONB-03 choosing few records no unlock", async () => {
    const { unlocks, run } = setup();
    await run("anna", input("few"));
    expect(await unlocks.list("anna")).toEqual([]);
  });

  it("US-ONB-03 an unknown style is refused with a stable code and nothing is written", async () => {
    const { styles, unlocks, run } = setup();
    for (const bad of ["level3", "", null, 1]) {
      expect(await run("anna", input(bad))).toMatchObject({
        ok: false,
        error: { code: "input.invalid" },
      });
    }
    expect(await styles.find("anna")).toBeNull();
    expect(await unlocks.list("anna")).toEqual([]);
  });

  it("US-ONB-03 the choice of one account never touches another (P-04)", async () => {
    const { styles, run } = setup();
    await run("anna", input("many"));
    expect(await styles.find("ben")).toBeNull();
  });
});
