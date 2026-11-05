import { describe, expect, it } from "vitest";
import type { UnlockEntry } from "./unlock-api";
import { isShownLocked, lockLine, lockMark } from "./unlock-texts";

const locked = (over: Partial<UnlockEntry>): UnlockEntry => ({
  id: "friends",
  state: "locked",
  announced: true,
  reasons: [],
  ways: [],
  mayUnlockNow: true,
  ...over,
});

describe("US-ONB-05 lock texts", () => {
  it("US-ONB-05 names the way for a missing time as a plain fact and marks it Bald", () => {
    const e = locked({
      id: "year_in_review",
      reasons: [{ kind: "days_since_first_specimen", needed: 365, have: 253 }],
      ways: [{ kind: "wait", days: 112, unlockDate: "2027-02-07" }],
    });
    expect(lockLine(e)).toBe("Jahresrückblick: noch 112 Tage");
    expect(lockMark(e)).toBe("Bald");
  });

  it("US-ONB-05 names missing plants and marks it Noch gesperrt", () => {
    const e = locked({
      id: "swapping",
      reasons: [{ kind: "specimens", needed: 5, have: 2 }],
      ways: [{ kind: "add_specimens", missing: 3 }],
    });
    expect(lockLine(e)).toBe("Tauschen: lege noch 3 Pflanzen an");
    expect(lockMark(e)).toBe("Noch gesperrt");
    const none = locked({
      id: "swapping",
      reasons: [{ kind: "specimens", needed: 3, have: 0 }],
      ways: [{ kind: "add_specimens", missing: 3 }],
    });
    expect(lockLine(none)).toBe("Tauschen: lege 3 Pflanzen an");
  });

  it("US-ONB-05 joins several ways with oder, one day in the singular", () => {
    const e = locked({
      id: "wishlist",
      reasons: [
        { kind: "days_since_first_specimen", needed: 28, have: 27 },
        { kind: "specimens", needed: 5, have: 4 },
      ],
      ways: [
        { kind: "wait", days: 1, unlockDate: "2026-11-01" },
        { kind: "add_specimens", missing: 1 },
      ],
    });
    expect(lockLine(e)).toBe("Wunschliste: noch 1 Tag oder lege noch 1 Pflanze an");
  });

  it("US-ONB-05 shows only announced locked functions: never open ones, never calm-mode ones", () => {
    expect(isShownLocked(locked({}))).toBe(true);
    expect(isShownLocked(locked({ announced: false }))).toBe(false);
    expect(isShownLocked(locked({ state: "open", mayUnlockNow: false }))).toBe(false);
  });
});
