import { describe, expect, it } from "vitest";
import {
  FLICK_SPEED,
  MAX_TILT_DEG,
  SWIPE_SHARE,
  dragPose,
  dragReading,
  flyPose,
  gestureDirection,
} from "./swipe-gesture";

/** A card 300 px wide: the threshold is 120 px (starting value, assumption). */
const W = 300;
const far = { width: W, speed: 0 };

describe("US-ENT-01 a release past the threshold decides, below it cancels", () => {
  it("US-ENT-01 a drag past 40 percent of the card width decides in its direction", () => {
    expect(gestureDirection({ dx: -W * SWIPE_SHARE, dy: 0, ...far })).toBe("left");
    expect(gestureDirection({ dx: W / 2, dy: 10, ...far })).toBe("right");
  });

  it("US-ENT-01 a drag below the threshold cancels: nothing is decided", () => {
    expect(gestureDirection({ dx: -W * SWIPE_SHARE + 1, dy: 0, ...far })).toBeNull();
    expect(gestureDirection({ dx: 100, dy: 110, ...far })).toBeNull();
    expect(gestureDirection({ dx: 0, dy: 0, ...far })).toBeNull();
  });

  it("US-ENT-01 a fast flick decides with less distance, a slow drag with the same distance does not", () => {
    expect(gestureDirection({ dx: W * 0.15, dy: 0, width: W, speed: FLICK_SPEED })).toBe("right");
    expect(
      gestureDirection({ dx: W * 0.15, dy: 0, width: W, speed: FLICK_SPEED - 0.01 }),
    ).toBeNull();
    expect(gestureDirection({ dx: W * 0.14, dy: 0, width: W, speed: 5 })).toBeNull();
  });

  it("US-TAU-02 a mostly vertical drag past the threshold is Later, up or down", () => {
    expect(gestureDirection({ dx: 10, dy: -W * SWIPE_SHARE, ...far })).toBe("up");
    expect(gestureDirection({ dx: -5, dy: W * 0.45, ...far })).toBe("down");
  });

  it("US-ENT-01 a card that is not measured (width 0) decides nothing", () => {
    expect(gestureDirection({ dx: -500, dy: 0, width: 0, speed: 5 })).toBeNull();
  });
});

describe("US-ENT-01 the drag shows direction and strength before the release", () => {
  it("US-ENT-01 the reading names the direction the drag leans to and grows to 1 at the threshold", () => {
    expect(dragReading({ dx: (-W * SWIPE_SHARE) / 2, dy: 0, width: W })).toEqual({
      direction: "left",
      strength: 0.5,
    });
    expect(dragReading({ dx: 0, dy: W * 0.6, width: W })).toEqual({
      direction: "down",
      strength: 1,
    });
  });

  it("US-ENT-01 no reading without a drag or without a measured card", () => {
    expect(dragReading({ dx: 0, dy: 0, width: W })).toBeNull();
    expect(dragReading({ dx: 40, dy: 0, width: 0 })).toBeNull();
  });

  it("US-ENT-01 the card follows the pointer and tilts by the horizontal distance, at most 8 degrees", () => {
    expect(dragPose({ dx: W / 2, dy: -20, width: W })).toEqual({
      x: W / 2,
      y: -20,
      rotate: MAX_TILT_DEG / 2,
    });
    expect(dragPose({ dx: -3 * W, dy: 0, width: W }).rotate).toBe(-MAX_TILT_DEG);
  });

  it("US-ENT-01 a flown card leaves the screen in the direction of its decision", () => {
    const viewport = { width: 400, height: 800 };
    expect(flyPose("left", viewport).x).toBeLessThan(0);
    expect(flyPose("right", viewport).x).toBeGreaterThan(0);
    expect(flyPose("up", viewport).y).toBeLessThan(0);
    expect(flyPose("down", viewport).y).toBeGreaterThan(0);
  });
});
