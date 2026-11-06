import { describe, expect, it } from "vitest";
import { execute } from "../../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import { CORE_FUNCTION_IDS, KEEPER_SWITCH_IDS } from "../unlock-registry";
import {
  accountSwitchFeature,
  keeperOffOf,
  type KeeperSwitchRow,
  type KeeperSwitchStore,
} from "./keeper-switch";

class InMemorySwitches implements KeeperSwitchStore {
  readonly rows = new Map<string, KeeperSwitchRow[]>();
  writes = 0;
  async list(userId: string) {
    return this.rows.get(userId) ?? [];
  }
  async set(userId: string, feature: KeeperSwitchRow["feature"], enabled: boolean, on: string) {
    this.writes += 1;
    const own = this.rows.get(userId) ?? [];
    const before = own.find((r) => r.feature === feature);
    // The date changes only with the state: repeating the same state keeps the day of the change.
    const changedOn = before && before.enabled === enabled ? before.changedOn : on;
    const row = { feature, enabled, changedOn };
    this.rows.set(userId, [...own.filter((r) => r.feature !== feature), row]);
    return row;
  }
}

const setup = () => {
  const switches = new InMemorySwitches();
  const idempotency = new InMemoryIdempotencyStore();
  const op = accountSwitchFeature({ switches });
  let n = 0;
  // `null` sends a call without an idempotency key.
  const run = (userId: string, input: unknown, key: string | null = `k${++n}`) =>
    execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: key ?? undefined });
  return { switches, run };
};

const input = (over: Record<string, unknown> = {}) => ({
  feature: "wishlist",
  enabled: false,
  on: "2026-11-06",
  ...over,
});

describe("US-ONB-09 keeper switch operation", () => {
  it("US-ONB-09 a keeper switches a switchable feature off and on again, with the local date of the change", async () => {
    const { switches, run } = setup();
    expect(await run("anna", input())).toMatchObject({
      ok: true,
      value: { feature: "wishlist", enabled: false, changedOn: "2026-11-06" },
    });
    expect(await run("anna", input({ enabled: true, on: "2026-11-07" }))).toMatchObject({
      ok: true,
      value: { feature: "wishlist", enabled: true, changedOn: "2026-11-07" },
    });
    expect(await switches.list("anna")).toEqual([
      { feature: "wishlist", enabled: true, changedOn: "2026-11-07" },
    ]);
  });

  it("US-ONB-09 repeating the same state keeps the date of the change", async () => {
    const { run } = setup();
    await run("anna", input());
    expect(await run("anna", input({ on: "2026-11-09" }))).toMatchObject({
      ok: true,
      value: { enabled: false, changedOn: "2026-11-06" },
    });
  });

  it("US-ONB-09 every switchable feature can be switched; friends covers friends and swapping", async () => {
    const { run } = setup();
    for (const feature of KEEPER_SWITCH_IDS)
      expect(await run("anna", input({ feature, enabled: false }))).toMatchObject({ ok: true });
  });

  it.each(CORE_FUNCTION_IDS)(
    "US-ONB-09 the core feature %s has no switch: refused with a stable code and nothing is written",
    async (feature) => {
      const { switches, run } = setup();
      expect(await run("anna", input({ feature }))).toMatchObject({
        ok: false,
        error: { code: "onboarding.core_feature" },
      });
      expect(switches.writes).toBe(0);
    },
  );

  it("US-ONB-09 an unknown feature is refused and nothing is written", async () => {
    const { switches, run } = setup();
    expect(await run("anna", input({ feature: "teleport" }))).toMatchObject({
      ok: false,
      error: { code: "onboarding.unknown_function" },
    });
    expect(switches.writes).toBe(0);
  });

  it("US-ONB-09 invalid input is refused before anything is written", async () => {
    const { switches, run } = setup();
    for (const bad of [
      input({ enabled: "no" }),
      input({ enabled: 0 }),
      input({ on: "2026-02-30" }),
      input({ feature: "" }),
    ])
      expect(await run("anna", bad)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(switches.writes).toBe(0);
  });

  it("US-ONB-09 a call without an idempotency key writes nothing", async () => {
    const { switches, run } = setup();
    expect(await run("anna", input(), null)).toMatchObject({
      ok: false,
      error: { code: "idempotency.key_missing" },
    });
    expect(switches.writes).toBe(0);
  });

  it("US-ONB-09 the same key does not write twice", async () => {
    const { switches, run } = setup();
    await run("anna", input(), "same");
    expect(await run("anna", input(), "same")).toMatchObject({ ok: true });
    expect(switches.writes).toBe(1);
  });

  it("US-ONB-09 the switch of one account never touches another (P-04)", async () => {
    const { switches, run } = setup();
    await run("anna", input());
    expect(await switches.list("ben")).toEqual([]);
  });

  it("US-ONB-09 keeperOffOf lists the switches that are off; a feature without a row is on", () => {
    expect(
      keeperOffOf([
        { feature: "wishlist", enabled: false, changedOn: "2026-11-06" },
        { feature: "friends", enabled: true, changedOn: "2026-11-06" },
      ]),
    ).toEqual(new Set(["wishlist"]));
  });
});
