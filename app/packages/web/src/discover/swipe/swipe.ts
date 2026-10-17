/** Smallest horizontal move that counts as a swipe (assumption, starting value; adjust after trying it on phones). */
export const SWIPE_MIN_PX = 80;

/**
 * Direction of a swipe gesture (US-ENT-01, NFR-13): left means "Nein", right means "Ja". A mostly vertical move is a
 * scroll, not a decision, and a short move is a tap; both give `null`.
 */
export function swipeDirection(dx: number, dy: number): "left" | "right" | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "left" : "right";
}
