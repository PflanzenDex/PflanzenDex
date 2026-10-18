import type { EmptyReason, MatchCard as Card } from "@pflanzendex/core";
import { Link } from "react-router";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Banner } from "@/components/shared/states/banner/banner";
import {
  EXCHANGE_PATH,
  PATHS,
  WISHLIST_MODE_ADDRESS,
} from "@/components/shared/navigation/nav-model/navigation/navigation";
import { Button } from "@/components/ui/button/button";
import { cardTitle as title } from "../deck-state";

export type Answer = "no" | "later" | "yes";

export const SIGN = (c: Card) => `${title(c)} von ${c.ownerName ?? "einem Freund"}`;

/** "Nein · Später · Ja" as buttons with text; the buttons are the way without a swipe (NFR-13, FR-TAU-08). */
export function Actions(props: { card: Card; onAnswer: (a: Answer) => void; busy: boolean }) {
  const { card: c, busy } = props;
  const who = SIGN(c);
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background py-2 md:bottom-0 [@media(max-height:30rem)]:static">
      <div className="mx-auto flex w-full max-w-md gap-2">
        <Button
          variant="outline"
          size="touch"
          className="flex-1"
          disabled={busy}
          aria-label={`Nein: ${who}`}
          onClick={() => props.onAnswer("no")}
        >
          Nein
        </Button>
        <Button
          variant="secondary"
          size="touch"
          className="flex-1"
          disabled={busy}
          aria-label={`Später: ${who}`}
          onClick={() => props.onAnswer("later")}
        >
          Später
        </Button>
        <Button
          size="touch"
          className="flex-1"
          disabled={busy}
          aria-label={`Ja, anfragen: ${who}`}
          onClick={() => props.onAnswer("yes")}
        >
          Ja
        </Button>
      </div>
    </div>
  );
}

const EMPTY_TEXT: Record<EmptyReason, { title: string; description: string }> = {
  no_friends: {
    title: "Du hast noch keine Freunde in der App.",
    description:
      "Passende Angebote kommen von Freunden. Lade zuerst einen Freund ein; sobald er etwas anbietet, das auf deiner Wunschliste steht, erscheint es hier.",
  },
  no_wishes: {
    title: "Deine Wunschliste ist leer.",
    description:
      "Hier erscheinen Angebote deiner Freunde, deren Art auf deiner Wunschliste steht. Lege einen Wunsch an oder entdecke Arten, die dir gefallen könnten.",
  },
  no_offers: {
    title: "Deine Freunde bieten gerade nichts an.",
    description:
      "Sobald ein Freund etwas anbietet, das auf deiner Wunschliste steht, erscheint es hier. In der Tauschbörse siehst du alle Angebote.",
  },
  no_match: {
    title: "Zurzeit passt kein Angebot zu deiner Wunschliste.",
    description:
      "Hier erscheinen offene Angebote deiner Freunde, deren Art auf deiner Wunschliste steht. Lege Wünsche an oder sieh dir alle Angebote in der Tauschbörse an.",
  },
};

/** The empty deck names the reason and the next step (US-TAU-07, P-09); the links lead to the places that fix it. */
export function Empty(props: { reason?: EmptyReason | null }) {
  const reason = props.reason ?? "no_match";
  const text = EMPTY_TEXT[reason];
  const invite = reason === "no_friends";
  return (
    <div className="grid gap-3">
      <EmptyState
        title={text.title}
        description={text.description}
        action={
          invite
            ? { label: "Freund einladen", href: PATHS.friends }
            : reason === "no_wishes"
              ? { label: "Wunsch hinzufügen", href: WISHLIST_MODE_ADDRESS }
              : { label: "Tauschbörse öffnen", href: EXCHANGE_PATH }
        }
      />
      <div className="flex flex-wrap justify-center gap-2">
        {reason === "no_wishes" && (
          <Button asChild variant="outline" size="touch">
            <Link to={PATHS.discover}>Arten entdecken</Link>
          </Button>
        )}
        {!invite && reason !== "no_wishes" && (
          <Button asChild variant="outline" size="touch">
            <Link to={WISHLIST_MODE_ADDRESS}>Wunsch hinzufügen</Link>
          </Button>
        )}
        {!invite && (
          <Button asChild variant="outline" size="touch">
            <Link to={PATHS.friends}>Freunde einladen</Link>
          </Button>
        )}
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
  onYes: () => void;
  onCancel: () => void;
}) {
  return (
    <Banner variant="info">
      <p className="m-0">{`Bei ${props.c.ownerName ?? "dem Freund"} anfragen: ${title(props.c)}?`}</p>
      <div className="mt-2 flex gap-2">
        <Button size="touch" disabled={props.busy} onClick={props.onYes}>
          Ja, anfragen
        </Button>
        <Button variant="outline" size="touch" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </Banner>
  );
}
