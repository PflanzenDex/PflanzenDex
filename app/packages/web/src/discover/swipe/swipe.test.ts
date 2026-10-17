import { describe, expect, it } from "vitest";
import { SWIPE_MIN_PX, swipeDirection } from "./swipe";

describe("US-ENT-01 swipe gesture", () => {
  it("US-ENT-01 a long horizontal move to the left is No and to the right is Yes", () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe("left");
    expect(swipeDirection(SWIPE_MIN_PX + 40, 10)).toBe("right");
  });

  it("US-ENT-01 a short move or a mostly vertical move is no decision", () => {
    expect(swipeDirection(SWIPE_MIN_PX - 1, 0)).toBeNull();
    expect(swipeDirection(100, 140)).toBeNull();
    expect(swipeDirection(0, 0)).toBeNull();
  });
});
