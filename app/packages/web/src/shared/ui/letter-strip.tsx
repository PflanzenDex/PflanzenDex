import { useRef } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { LETTERS } from "./letter-strip.letters";
import { useLabelStep, useStripControl } from "./letter-strip.strip-control";

/**
 * The width the rows give up for the strip (44 px, rem, so it follows the text size): a touch on it is as wide as a target of
 * SG-TOUCH-01 and as high as the whole strip, so the 27 places need no target of their own.
 */
export const STRIP_WIDTH = "w-11";

/**
 * One place of the strip: the letter of a group with entries is in the primary colour, one without is dimmed, not removed. The
 * 27 places share the height of the strip equally (`flex-1`), so the whole strip stays reachable at every text size; only the
 * labels keep their size and thin out where they would touch (`useLabelStep`).
 */
const place = cva("flex min-h-0 flex-1 items-center justify-center", {
  variants: {
    entries: { present: "text-primary", absent: "text-muted-foreground" },
    label: { shown: "", thinned: "invisible" },
  },
  defaultVariants: { entries: "absent", label: "shown" },
});

/**
 * The letter strip of a long list sorted by name (SG-LIST-11, owner decision 2026-11-22, issue 2419): the letters A to Z and
 * "#" in a narrow vertical strip at the trailing edge of the list. A tap or a drag on the strip jumps to the first entry of
 * the letter under the finger (`onJump`, at once, no glide) and shows that letter large beside the strip while the finger is
 * down; a letter without an entry is dimmed (muted, not removed) and the jump goes on to the next one that has an entry.
 *
 * The strip is one control for the keyboard and the screen reader, not 27 buttons: a vertical slider named `label` with one
 * tab stop (arrow keys step through the letters that have entries, Home and End go to the first and the last), so the
 * keyboard walk gains one stop, not 27. The letters themselves are no separate stops and are hidden from assistive technology
 * (the value text says the letter); the bubble is hidden too.
 */
export function LetterStrip(props: {
  /** Accessible name of the strip (German), e.g. "Zum Buchstaben springen". */
  label: string;
  /** The letters that have an entry, in the order of the strip. */
  present: ReadonlySet<string>;
  onJump: (letter: string) => void;
}) {
  const { present } = props;
  const strip = useRef<HTMLDivElement>(null);
  const step = useLabelStep(strip);
  const { letters, shown, dragging, handlers } = useStripControl(strip, present, props.onJump);
  return (
    <>
      <div
        ref={strip}
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, letters.length - 1)}
        aria-valuenow={Math.max(0, shown === undefined ? 0 : letters.indexOf(shown))}
        aria-valuetext={shown ?? ""}
        data-letter-index=""
        // The touch is the strip's own: it neither scrolls the list nor the page while a finger moves on it.
        className={cn(
          STRIP_WIDTH,
          "flex shrink-0 touch-none select-none flex-col items-center self-stretch rounded-control text-xs font-semibold leading-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        {...handlers}
      >
        {LETTERS.map((letter, i) => (
          <span
            key={letter}
            aria-hidden="true"
            className={place({
              entries: present.has(letter) ? "present" : "absent",
              label: i % step === 0 ? "shown" : "thinned",
            })}
          >
            <span>{letter}</span>
          </span>
        ))}
      </div>
      {dragging && shown !== undefined ? (
        <p
          aria-hidden="true"
          data-letter-bubble=""
          className="pointer-events-none absolute right-12 top-1/2 z-20 m-0 flex size-16 -translate-y-1/2 items-center justify-center rounded-card bg-primary text-3xl font-semibold text-primary-foreground shadow-elevation-2 forced-colors:border forced-colors:border-[CanvasText]"
        >
          {shown}
        </p>
      ) : null}
    </>
  );
}
