import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { SwipeDirection } from "../swipe-gesture";

/** Cards visible below the top card (US-ENT-10, two levels, decided by the PO, revisable). */
export const STACK_LEVELS = 2;
/** Each lower card is this share smaller than the one above it (US-ENT-10, starting value 4 percent, assumption). */
export const STACK_SCALE_STEP = 0.04;
/** Each lower card sits this many px lower than the one above it (US-ENT-10, starting value 8 px, assumption). */
export const STACK_OFFSET_PX = 8;
/** The room below the top card where the lower cards show; the stack keeps the height of the single card (US-ENT-10). */
export const STACK_RESERVE_PX = STACK_LEVELS * STACK_OFFSET_PX;

/** Motion of the card, shared by the fly-off and the spring back; `motion-reduce` ends it at once. */
export const MOTION =
  "transition-transform duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none";

/**
 * The dynamic values of a gesture (the drag, the flight, the stamp strength) reach the classes as CSS custom properties,
 * which the classes read (DS-32). Nothing else is set inline.
 */
export function cssVars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/**
 * Where a lower card stands: `level` 1 is right below the top card. `lift` (0 to 1) moves it up towards the next level:
 * with the strength of a drag, and fully while the top card leaves, so the card below grows into its place (US-ENT-10).
 */
export function levelPose(level: number, lift: number): { scale: number; y: number } {
  const step = Math.max(0, level - Math.min(1, Math.max(0, lift)));
  return {
    scale: Math.round((1 - step * STACK_SCALE_STEP) * 1000) / 1000,
    y: Math.round(step * STACK_OFFSET_PX * 100) / 100,
  };
}

/**
 * The cards below the top card (US-ENT-01, US-ENT-10): up to `STACK_LEVELS`, each a little smaller and lower, so the depth
 * of the deck shows. The first one carries the content of the next card, the deeper one is a blank frame. All are hidden
 * from assistive technology and not focusable (`aria-hidden`, `inert`).
 */
export function StackLevels(props: {
  depth: number;
  lift: number;
  /** The top card follows the finger: the levels follow it too, without a transition. */
  dragging: boolean;
  under?: ReactNode;
}) {
  const levels = Array.from({ length: Math.min(STACK_LEVELS, props.depth) }, (_, i) => i + 1);
  return levels.reverse().map((level) => {
    const pose = levelPose(level, props.lift);
    return (
      <div
        key={level}
        aria-hidden="true"
        inert
        data-level={level}
        className={cn(
          "pointer-events-none absolute inset-0 flex origin-bottom flex-col overflow-hidden rounded-xl border border-border bg-card translate-y-(--level-y) scale-(--level-scale)",
          props.dragging ? "transition-none" : MOTION,
        )}
        style={cssVars({ "--level-scale": String(pose.scale), "--level-y": `${pose.y}px` })}
      >
        {level === 1 ? props.under : null}
      </div>
    );
  });
}

/** The colour of a stamp tells the decision as well as its text does, never colour alone (NFR-13). */
const STAMP_TONE: Record<SwipeDirection, string> = {
  left: "border-destructive text-destructive",
  right: "border-primary text-primary",
  up: "border-muted-foreground text-muted-foreground",
  down: "border-muted-foreground text-muted-foreground",
};

const STAMP_PLACE: Record<SwipeDirection, string> = {
  left: "left-3 top-14 -rotate-12",
  right: "right-3 top-14 rotate-12",
  up: "left-1/2 top-14 -translate-x-1/2",
  down: "bottom-14 left-1/2 -translate-x-1/2",
};

export function Stamp(props: { direction: SwipeDirection; opacity: number; text: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-10 rounded-lg border-4 bg-card px-3 py-1 text-2xl font-bold opacity-(--stamp-opacity)",
        STAMP_PLACE[props.direction],
        STAMP_TONE[props.direction],
      )}
      style={cssVars({ "--stamp-opacity": String(props.opacity) })}
    >
      {props.text}
    </div>
  );
}
