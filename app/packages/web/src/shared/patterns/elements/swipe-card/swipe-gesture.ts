/**
 * The four ways a card leaves the deck: "left" is No, "right" is Yes, "up" and "down" are Later (US-ENT-01, US-TAU-02).
 * Pure logic without a DOM (P-02), so the threshold, the direction and the strength are testable on their own.
 */
export type SwipeDirection = "left" | "right" | "up" | "down";

/** Share of the card width a drag must cover to decide (US-TAU-02, starting value 40 percent, assumption). */
export const SWIPE_SHARE = 0.4;
/** Speed in px per ms of a flick that decides with less distance (starting value, assumption). */
export const FLICK_SPEED = 0.6;
/** Least share of the card width a flick must cover, so that a tremor is no decision (starting value, assumption). */
export const FLICK_MIN_SHARE = 0.15;
/** A flick counts only if the pointer was still moving this many ms before the release (starting value, assumption). */
export const FLICK_FRESH_MS = 100;
/** Movement in px before a press becomes a drag, so that a tap on a button stays a tap (starting value). */
export const DRAG_SLOP_PX = 8;
/** Tilt in degrees at a drag as wide as the card: a slight rotation (starting value, assumption). */
export const MAX_TILT_DEG = 8;
/** Tilt in degrees of a card that flies off to the side (starting value, assumption). */
export const FLY_TILT_DEG = 15;
/** Duration in ms of the fly-off and of the spring back; the same as the motion token `--motion-base` (assumption). */
export const EXIT_MS = 200;

/** Where the card is: moved by `x` and `y` px and tilted by `rotate` degrees. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
}

export const REST: Pose = { x: 0, y: 0, rotate: 0 };

/** The direction a finished drag decides, or `null` below the threshold or on a card that is not measured. */
export function gestureDirection(d: {
  dx: number;
  dy: number;
  width: number;
  speed: number;
}): SwipeDirection | null {
  if (!(d.width > 0)) return null;
  const horizontal = Math.abs(d.dx) > Math.abs(d.dy);
  const distance = horizontal ? Math.abs(d.dx) : Math.abs(d.dy);
  const far = distance >= SWIPE_SHARE * d.width;
  const flick = d.speed >= FLICK_SPEED && distance >= FLICK_MIN_SHARE * d.width;
  if (!far && !flick) return null;
  if (horizontal) return d.dx < 0 ? "left" : "right";
  return d.dy < 0 ? "up" : "down";
}

/**
 * What a drag in progress shows before the release: the direction it leans to and its strength, 0 at the start and 1 at
 * the threshold (the stamp fades in with it, US-ENT-01). `null` without a drag or without a measured card.
 */
export function dragReading(d: {
  dx: number;
  dy: number;
  width: number;
}): { direction: SwipeDirection; strength: number } | null {
  if (!(d.width > 0)) return null;
  const horizontal = Math.abs(d.dx) > Math.abs(d.dy);
  const distance = horizontal ? Math.abs(d.dx) : Math.abs(d.dy);
  if (distance === 0) return null;
  let direction: SwipeDirection;
  if (horizontal) direction = d.dx < 0 ? "left" : "right";
  else direction = d.dy < 0 ? "up" : "down";
  return { direction, strength: Math.min(1, distance / (SWIPE_SHARE * d.width)) };
}

/** The pose while the pointer drags: the card follows it, tilted by the horizontal distance (at most `MAX_TILT_DEG`). */
export function dragPose(d: { dx: number; dy: number; width: number }): Pose {
  const share = d.width > 0 ? Math.max(-1, Math.min(1, d.dx / d.width)) : 0;
  return { x: d.dx, y: d.dy, rotate: Math.round(share * MAX_TILT_DEG * 100) / 100 };
}

/** The pose a card leaves in: off the screen in the direction of its decision (`viewport` in px). */
export function flyPose(
  direction: SwipeDirection,
  viewport: { width: number; height: number },
): Pose {
  switch (direction) {
    case "left":
      return { x: -viewport.width, y: 0, rotate: -FLY_TILT_DEG };
    case "right":
      return { x: viewport.width, y: 0, rotate: FLY_TILT_DEG };
    case "up":
      return { x: 0, y: -viewport.height, rotate: 0 };
    case "down":
      return { x: 0, y: viewport.height, rotate: 0 };
  }
}
