import { MATCH_ANSWERS, type MatchCard as Card } from "@pflanzendex/core";
import { NetworkSlot } from "@/shared/ui/button/network-gate/network-gate";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { cardTitle as title } from "../deck-state";

export type Answer = "no" | "later" | "yes";
const LATER = MATCH_ANSWERS[1];
export const SIGN = (c: Card) => `${title(c)} von ${c.ownerName ?? "einem Freund"}`;

/**
 * True when the text size is raised to 150 % or more (US-QS-21, WCAG 1.4.4). Media queries do not follow the root font
 * size, so the row reads it: a sticky row would cover the card, so it scrolls with the content instead (US-QS-32).
 */
export function largeText(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24;
}

/**
 * "Ablehnen · Später · Anfragen" as buttons with text; the buttons are the way without a swipe (NFR-13, FR-TAU-08). At large
 * text the row is not sticky and the buttons wrap, so the row comes after the card and no word is cut (US-QS-32, SG-TYPE-04).
 */
export function Actions(props: {
  card: Card;
  onAnswer: (a: Answer) => void;
  busy: boolean;
  /** Large text (US-QS-32): the row follows the card in the flow. */
  large: boolean;
}) {
  const { card: c, busy, large } = props;
  const who = SIGN(c);
  return (
    <div
      className={cn(
        "z-10 border-t border-border bg-background py-2",
        !large &&
          "tall-window:sticky tall-window:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] tall-window:md:bottom-0",
        large && "tall-window:mb-20 tall-window:md:mb-0",
      )}
    >
      <div className="mx-auto flex w-full max-w-md flex-wrap gap-2">
        <NetworkSlot visible={false}>
          <Button
            variant="outline"
            size="touch"
            className="min-w-24 flex-1"
            disabled={busy}
            needsNetwork
            aria-label={`Ablehnen: ${who}`}
            onClick={() => props.onAnswer("no")}
          >
            Ablehnen
          </Button>
          <Button
            variant="secondary"
            size="touch"
            className="min-w-24 flex-1"
            disabled={busy}
            needsNetwork
            aria-label={`Später: ${who}`}
            onClick={() => props.onAnswer(LATER)}
          >
            Später
          </Button>
          <Button
            size="touch"
            className="min-w-24 flex-1"
            disabled={busy}
            needsNetwork
            aria-label={`Anfragen: ${who}`}
            onClick={() => props.onAnswer("yes")}
          >
            Anfragen
          </Button>
        </NetworkSlot>
      </div>
    </div>
  );
}

export function UndoButton(props: { onClick: () => void }) {
  return (
    <div className="text-center">
      <Button variant="outline" size="touch" onClick={props.onClick}>
        Rückgängig
      </Button>
    </div>
  );
}

/** The question after a swipe to the right: a gesture alone never sends a request (FR-TAU-03). */
export function Confirm(props: {
  c: Card;
  busy: boolean;
  onYes: (counterSpecimenId: string | null) => void;
  onCancel: () => void;
}) {
  const { c } = props;
  const both = c.reasons.find((r) => r.kind === "both_ways");
  const mine = both ? (both.speciesGerman ?? both.speciesLatin ?? "dein Angebot") : null;
  return (
    <Banner variant="info">
      <p className="m-0">{`Bei ${c.ownerName ?? "dem Freund"} anfragen: ${title(c)}?`}</p>
      {both && (
        <p className="m-0 mt-1">{`Als Gegengabe schlagen wir dein Angebot vor: ${mine}. Du kannst auch ohne Gegengabe anfragen.`}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="touch"
          disabled={props.busy}
          onClick={() => props.onYes(both ? both.specimenId : null)}
        >
          {both ? `Mit ${mine} anfragen` : "Anfragen"}
        </Button>
        {both && (
          <Button
            variant="outline"
            size="touch"
            disabled={props.busy}
            onClick={() => props.onYes(null)}
          >
            Ohne Gegengabe anfragen
          </Button>
        )}
        <Button variant="outline" size="touch" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </Banner>
  );
}
