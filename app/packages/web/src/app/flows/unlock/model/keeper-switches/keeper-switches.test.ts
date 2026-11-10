import { describe, expect, it } from "vitest";
import type { UnlockEntry } from "../unlock-api";
import { keeperSwitchesOff, withKeeperSwitches } from "./keeper-switches";

const entry = (id: string, state: UnlockEntry["state"], keeperSwitch?: string): UnlockEntry =>
  ({
    id,
    state,
    announced: state !== "keeper_off",
    reasons: [],
    ways: [],
    mayUnlockNow: false,
    ...(keeperSwitch ? { keeperSwitch } : {}),
  }) as UnlockEntry;

describe("US-ONB-09 keeper switches in the interface", () => {
  it("US-ONB-09 a function in state keeper_off names its switch as off; other states do not", () => {
    const off = keeperSwitchesOff([
      entry("wishlist", "keeper_off", "wishlist"),
      entry("swapping", "keeper_off", "friends"),
      entry("friends", "keeper_off", "friends"),
      entry("discover", "locked", "discover"),
      entry("today", "open"),
    ]);
    expect([...off].sort()).toEqual(["friends", "wishlist"]);
  });

  it("US-ONB-09 a keeper-off friends switch turns the friends group off, a keeper-off AI switch the AI group", () => {
    const features = withKeeperSwitches(
      { social: true, ai: true, recommendations: true },
      new Set(["friends", "ai_access"]),
    );
    expect(features).toMatchObject({ social: false, ai: false, recommendations: true });
  });

  it("US-ONB-09 the operator's switch stays off whatever the keeper says, and an unlock never turns a group on", () => {
    expect(
      withKeeperSwitches({ social: false, ai: true, recommendations: true }, new Set()),
    ).toMatchObject({ social: false });
  });

  it("US-ONB-09 the wishlist, discover, equipment and achievements groups follow their keeper switches", () => {
    const off = new Set(["wishlist", "discover", "equipment", "achievement_views"]);
    expect(withKeeperSwitches(undefined, off)).toMatchObject({
      wishlist: false,
      discover: false,
      equipment: false,
      achievement_views: false,
    });
    expect(withKeeperSwitches(undefined, new Set())).toMatchObject({
      wishlist: true,
      discover: true,
      equipment: true,
      achievement_views: true,
    });
  });

  it("US-BES-17 the pot labels group follows its keeper switch", () => {
    expect(withKeeperSwitches(undefined, new Set(["pot_labels"]))).toMatchObject({
      pot_labels: false,
    });
    expect(withKeeperSwitches(undefined, new Set())).toMatchObject({ pot_labels: true });
  });

  it("US-BES-18 the import follows its keeper switch csv_import", () => {
    expect(withKeeperSwitches(undefined, new Set(["csv_import"]))).toMatchObject({
      csv_import: false,
    });
    expect(withKeeperSwitches(undefined, new Set())).toMatchObject({ csv_import: true });
  });

  it("US-ONB-09 no state sent counts as on: only an explicit off hides, nothing is hidden by the lock states failing (P-10)", () => {
    expect(withKeeperSwitches(undefined, new Set())).toMatchObject({ social: true, ai: true });
    expect(keeperSwitchesOff([])).toEqual(new Set());
  });
});
