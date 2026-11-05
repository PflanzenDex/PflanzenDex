import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { vibrateOnDecision } from "@/shared/platform/device/haptics";
import { useReducedMotion } from "@/shared/platform/device/use-reduced-motion";
import { useCardGesture, type Drag } from "./use-card-gesture";
import {
  EXIT_MS,
  REST,
  dragPose,
  dragReading,
  flyPose,
  gestureDirection,
  type Pose,
  type SwipeDirection,
} from "./swipe-gesture";

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

/** Motion of the card, shared by the fly-off and the spring back; `motion-reduce` ends it at once. */
const MOTION =
  "transition-transform duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none";

/**
 * The dynamic values of a gesture (the drag, the flight, the stamp strength) reach the classes as CSS custom properties,
 * which the classes read (DS-32). Nothing else is set inline.
 */
function cssVars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

export interface SwipeCardProps {
  /** The card: its content, the card's own scroll region included. */
  children: ReactNode;
  /** Set by the parent to fly the card off in a direction (a decision); `null` brings it back to its place. */
  exit: SwipeDirection | null;
  /** The text of the stamp per direction, from the feature's message table (FR-QG-26). */
  stamps: Record<SwipeDirection, string>;
  /** A drag ended past the threshold. The parent sets `exit`, or asks first (no fly-off then). */
  onSwipe: (direction: SwipeDirection) => void;
  /** The card has left the screen (at once under reduced motion): the parent writes the decision now. */
  onExited: (direction: SwipeDirection) => void;
  /** No gesture while the parent is busy. */
  disabled?: boolean;
  /** A next card waits underneath: a blank frame that grows to full size while this card leaves. */
  stacked?: boolean;
  className?: string;
}

/** Reports the end of a flight once: after the fly-off time, at once under reduced motion; a decision vibrates once. */
function useFlightEnd(
  exit: SwipeDirection | null,
  onExited: (d: SwipeDirection) => void,
  reduced: boolean,
) {
  const onExitedRef = useRef(onExited);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    onExitedRef.current = onExited;
    reducedRef.current = reduced;
  });
  useEffect(() => {
    if (exit === null) return;
    vibrateOnDecision();
    if (reducedRef.current) {
      onExitedRef.current(exit);
      return;
    }
    const timer = setTimeout(() => onExitedRef.current(exit), EXIT_MS);
    return () => clearTimeout(timer);
  }, [exit]);
}

/** Where the card is: flown off for a decision, following the drag (not under reduced motion), else in its place. */
function poseOf(exit: SwipeDirection | null, drag: Drag | null, reduced: boolean): Pose {
  if (exit !== null) return flyPose(exit, { width: window.innerWidth, height: window.innerHeight });
  if (drag !== null && !reduced) return dragPose(drag);
  return REST;
}

/**
 * The stamp to show: the decision in flight, or the direction of the drag with its strength (fades in with the drag).
 * Under reduced motion the stamp is not faded: it shows whole once the drag is past the threshold.
 */
function stampOf(
  exit: SwipeDirection | null,
  drag: Drag | null,
  reduced: boolean,
): { direction: SwipeDirection; opacity: number } | null {
  if (exit !== null) return { direction: exit, opacity: 1 };
  if (drag === null) return null;
  const reading = dragReading(drag);
  if (reading === null) return null;
  const opacity = reduced ? (gestureDirection(drag) === null ? 0 : 1) : reading.strength;
  return { direction: reading.direction, opacity };
}

function Stamp(props: { direction: SwipeDirection; opacity: number; text: string }) {
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

/**
 * A card that follows the pointer (US-ENT-01, US-TAU-02): it tilts with the drag, a stamp of the direction fades in before
 * the release, a release past the threshold flies it off and a release before it springs back. Buttons and keys set `exit`
 * the same way, so both give the same result with the same animation. A vertical drag starts on the grip at the top
 * edge, so that the text keeps scrolling; horizontal drags work everywhere. Under reduced motion nothing moves, but the
 * stamp and the decision still show at once.
 */
export function SwipeCard(props: SwipeCardProps) {
  const { children, exit, stamps, onSwipe, onExited, className } = props;
  const { disabled = false, stacked = true } = props;
  const reduced = useReducedMotion();
  useFlightEnd(exit, onExited, reduced);
  const { drag, handlers } = useCardGesture(disabled || exit !== null, onSwipe);
  const dragging = drag !== null && exit === null;
  const pose = poseOf(exit, drag, reduced);
  const stamp = stampOf(exit, drag, reduced);
  return (
    <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {stacked && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-xl border border-border bg-card scale-(--under-scale)",
            MOTION,
          )}
          style={cssVars({ "--under-scale": exit === null ? "0.95" : "1" })}
        />
      )}
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 touch-pan-y flex-col translate-x-(--swipe-x) translate-y-(--swipe-y) rotate-(--swipe-rotate)",
          dragging ? "transition-none" : MOTION,
        )}
        style={cssVars({
          "--swipe-x": `${pose.x}px`,
          "--swipe-y": `${pose.y}px`,
          "--swipe-rotate": `${pose.rotate}deg`,
        })}
        {...handlers}
      >
        {children}
        <div aria-hidden="true" data-grip="" className="absolute inset-x-0 top-0 h-11 touch-none" />
        {stamp !== null && (
          <Stamp
            direction={stamp.direction}
            opacity={stamp.opacity}
            text={stamps[stamp.direction]}
          />
        )}
      </div>
    </div>
  );
}
