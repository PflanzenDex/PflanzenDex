import { describe, expect, it } from "vitest";
import { wishNameKey } from "./name-key";

describe("US-WUN-01 the key that makes wish names unique (FR-WUN-06)", () => {
  it.each([
    ["Aloe vera", "aloe vera"],
    ["ALOE VERA", "aloe vera"],
    ["Café", "cafe"],
    ["Cafe\u0301", "cafe"],
    ["Müller-Dornröschen", "muller-dornroschen"],
    ["Žižkov", "zizkov"],
  ])("US-WUN-01 folds %s to %s", (name, key) => {
    expect(wishNameKey(name)).toBe(key);
  });

  it("US-WUN-01 keeps letters that are no accented base letters apart", () => {
    expect(wishNameKey("Straße")).not.toBe(wishNameKey("Strasse"));
    expect(wishNameKey("Aloe")).not.toBe(wishNameKey("Aloes"));
  });
});
