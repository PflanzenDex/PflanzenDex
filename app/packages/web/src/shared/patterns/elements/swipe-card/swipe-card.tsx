import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { useReducedMotion } from "@/shared/platform/device/motion/use-reduced-motion";
import { useCardGesture, type Drag } from "./use-card-gesture";
import { MOTION, STACK_RESERVE_PX, Stamp, StackLevels, cssVars } from "./card-stack/card-stack";
import {
  thrownAlong,
  useEntering,
  useFlightEnd,
  useThrow,
  viewport,
} from "./card-stack/use-card-motion";
import {
  REST,
  dragPose,
  dragReading,
  flyPose,
  gestureDirection,
  throwPose,
  type Pose,
  type SwipeDirection,
  type Throw,
} from "./swipe-gesture";

export interface SwipeCardProps {
  /** The card: its content, the card's own scroll region included. */
  children: ReactNode;
  /** Set by the parent to fly the card off in a direction (a decision); `null` brings it back to its place. */
  exit: SwipeDirection | null;
  /** The text of the stamp per direction, from the feature's message table (FR-QG-26). */
  stamps: Record<SwipeDirection, string>;
  /** A drag ended past the threshold. The parent sets `exit`, or asks first (no fly-off then). */
  onSwipe: (direction: SwipeDirection) => void;
  /** The card has left the screen (after the stamp under reduced motion): the parent writes the decision now. */
  onExited: (direction: SwipeDirection) => void;
  /** No gesture while the parent is busy. */
  disabled?: boolean;
  /** A next card waits underneath: a frame that grows to full size while this card leaves. */
  stacked?: boolean;
  /** Cards left below this one (US-ENT-10); up to two show as a stack. Without it, `stacked` shows one. */
  depth?: number;
  /** The card comes back onto the stack from this side (a decision taken back, US-ENT-10); read when it mounts. */
  enterFrom?: SwipeDirection | null;
  /**
   * The content of the next card, shown underneath in the frame (the frame stays blank without it). It is hidden from
   * assistive technology and not focusable (`aria-hidden`, `inert`); its element ids must differ from the front card's.
   */
  under?: ReactNode;
  className?: string;
}

/** The stamp to show: the decision in flight, or the direction of the drag with its strength (whole under reduced motion). */
function stampOf(exit: SwipeDirection | null, drag: Drag | null, reduced: boolean) {
  if (exit !== null) return { direction: exit, opacity: 1 };
  const reading = drag === null ? null : dragReading(drag);
  if (drag === null || reading === null) return null;
  const opacity = reduced ? (gestureDirection(drag) === null ? 0 : 1) : reading.strength;
  return { direction: reading.direction, opacity };
}

/**
 * Where the top card is and how far the cards below have moved up (0 to 1): flown off along the throw or the direction of
 * the decision, following the drag, coming back from a side, or in place. Under reduced motion nothing moves.
 */
function motionOf(p: {
  exit: SwipeDirection | null;
  drag: Drag | null;
  thrown: Throw | null;
  enterFrom: SwipeDirection | null;
  entering: boolean;
  reduced: boolean;
}): { pose: Pose; lift: number } {
  if (p.reduced) return { pose: REST, lift: 0 };
  if (p.entering && p.enterFrom !== null)
    return { pose: flyPose(p.enterFrom, viewport()), lift: 1 };
  if (p.exit !== null) {
    const along = thrownAlong(p.thrown, p.exit);
    return { pose: along ? throwPose(along, viewport()) : flyPose(p.exit, viewport()), lift: 1 };
  }
  if (p.drag !== null) return { pose: dragPose(p.drag), lift: dragReading(p.drag)?.strength ?? 0 };
  return { pose: REST, lift: 0 };
}

/**
 * A card on a stack that follows the pointer (US-ENT-01, US-ENT-10, US-TAU-02): it tilts with the drag, a stamp of the
 * direction fades in before the release, the card below grows with the drag, a release past the threshold throws it off
 * along the line of the release and a release before it springs back. Buttons and keys set `exit` the same way, so both
 * give the same result with the same animation. A vertical drag starts on the grip at the top edge, so that the text
 * keeps scrolling. Under reduced motion nothing moves: the stack is a still picture, the stamp shows for a moment.
 */
export function SwipeCard(props: SwipeCardProps) {
  const { children, exit, stamps, onSwipe, onExited, className } = props;
  const { disabled = false, stacked = true, under, enterFrom = null } = props;
  const depth = props.depth ?? (stacked ? 1 : 0);
  const reduced = useReducedMotion();
  const entering = useEntering(enterFrom, reduced);
  const { thrown, setThrown, ms } = useThrow(exit);
  const { drag, handlers } = useCardGesture(disabled || exit !== null, (d, t) => {
    setThrown(t);
    onSwipe(d);
  });
  useFlightEnd(exit, onExited, reduced, ms);
  const dragging = (drag !== null && exit === null) || entering;
  const { pose, lift } = motionOf({ exit, drag, thrown, enterFrom, entering, reduced });
  const stamp = stampOf(exit, drag, reduced);
  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col pb-(--stack-reserve)",
        className,
      )}
      style={cssVars({ "--stack-reserve": `${STACK_RESERVE_PX}px` })}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <StackLevels depth={depth} lift={lift} dragging={dragging} under={under} />
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 touch-pan-y flex-col translate-x-(--swipe-x) translate-y-(--swipe-y) rotate-(--swipe-rotate)",
            dragging ? "transition-none" : MOTION,
            // A throw keeps its speed (US-ENT-10): the flight takes the time the timer of the decision waits.
            "duration-(--swipe-ms)",
          )}
          style={cssVars({
            "--swipe-x": `${pose.x}px`,
            "--swipe-y": `${pose.y}px`,
            "--swipe-rotate": `${pose.rotate}deg`,
            "--swipe-ms": `${ms}ms`,
          })}
          {...handlers}
        >
          {children}
          <div
            aria-hidden="true"
            data-grip=""
            className="absolute inset-x-0 top-0 h-11 touch-none"
          />
          {stamp !== null && (
            <Stamp
              direction={stamp.direction}
              opacity={stamp.opacity}
              text={stamps[stamp.direction]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
