import { MATCH_ANSWERS, type EmptyReason, type MatchCard as Card } from "@pflanzendex/core";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { Link } from "react-router";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Banner } from "@/shared/patterns/states/banner/banner";
import {
  EXCHANGE_PATH,
  MATCH_PATH,
  PATHS,
  WISHLIST_MODE_ADDRESS,
} from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../../swap.de.json";
import { cardTitle as title } from "../deck-state";
import { decisionRowClass } from "./decision-row";
const t = texts(table);
export type Answer = "no" | "later" | "yes";
const LATER = MATCH_ANSWERS[1];
export const SIGN = (c: Card) => `${title(c)} von ${c.ownerName ?? "einem Freund"}`;
/** "Ablehnen · Später · Anfragen" as buttons with text; the buttons are the way without a swipe (NFR-13, FR-TAU-08). */
export function Actions(props: {
  card: Card;
  onAnswer: (a: Answer) => void;
  busy: boolean;
  large: boolean;
}) {
  const { card: c, busy, large } = props;
  const who = SIGN(c);
  return (
    <div className={decisionRowClass(large)}>
      <div className="mx-auto flex w-full max-w-md flex-wrap gap-2">
        <NetworkSlot visible={false}>
          <Button
            variant="plain"
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
            variant="tinted"
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
/** The text and the one filled action (label and href) of each empty reason (US-TAU-07, P-09); the texts of the two reasons of US-TAU-03 come from the message table. */
type EmptyText = { title: string; description: string; action: string; href: string };
const EMPTY_TEXT: Record<EmptyReason, EmptyText> = {
  no_friends: {
    title: "Du hast noch keine Freunde in der App",
    description:
      "Passende Angebote kommen von Freunden. Lade zuerst einen Freund ein; sobald er etwas anbietet, das auf deiner Wunschliste steht, erscheint es hier.",
    action: "Freund einladen",
    href: PATHS.friends,
  },
  no_wishes: {
    title: "Deine Wunschliste ist leer",
    description:
      "Hier erscheinen Angebote deiner Freunde, deren Art auf deiner Wunschliste steht. Lege einen Wunsch an oder entdecke Arten, die dir gefallen könnten.",
    action: "Wunsch hinzufügen",
    href: WISHLIST_MODE_ADDRESS,
  },
  no_offers: {
    title: "Deine Freunde bieten gerade nichts an",
    description:
      "Sobald ein Freund etwas anbietet, das auf deiner Wunschliste steht, erscheint es hier. In der Tauschbörse siehst du alle Angebote.",
    action: "Tauschbörse öffnen",
    href: EXCHANGE_PATH,
  },
  no_match: {
    title: "Zurzeit passt kein Angebot zu deiner Wunschliste",
    description:
      "Hier erscheinen offene Angebote deiner Freunde, deren Art auf deiner Wunschliste steht.",
    action: "Tauschbörse öffnen",
    href: EXCHANGE_PATH,
  },
  // US-TAU-03: every offer that matches a wish has my open request; the next step is Requests (P-09).
  all_requested: {
    title: t("match.empty.allRequested.title"),
    description: t("match.empty.allRequested.description"),
    action: t("match.empty.allRequested.action"),
    href: `${EXCHANGE_PATH}?part=requests`,
  },
  // US-TAU-07: no card is left because my No or Later holds the rest; the next step is the deck with its lists (P-09).
  all_answered: {
    title: t("match.empty.allAnswered.title"),
    description: t("match.empty.allAnswered.description"),
    action: t("match.empty.allAnswered.action"),
    href: MATCH_PATH,
  },
};
/** The empty deck names the reason and the next step (US-TAU-07, P-09); one filled action, the other ways stay as text links. */
export function Empty(props: { reason?: EmptyReason | null }) {
  const reason = props.reason ?? "no_match";
  const text = EMPTY_TEXT[reason];
  const invite = reason === "no_friends";
  return (
    <div className="grid gap-3">
      <EmptyState
        className="gap-3 py-6"
        title={text.title}
        description={text.description}
        action={{ label: text.action, href: text.href }}
      />
      <div className="flex flex-wrap justify-center gap-x-4">
        {reason === "no_wishes" && (
          <Button asChild variant="link" size="touch">
            <Link to={PATHS.discover}>Arten entdecken</Link>
          </Button>
        )}
        {!invite && reason !== "no_wishes" && (
          <Button asChild variant="link" size="touch">
            <Link to={WISHLIST_MODE_ADDRESS}>Wunsch hinzufügen</Link>
          </Button>
        )}
        {!invite && (
          <Button asChild variant="link" size="touch">
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
      <Button variant="plain" size="touch" onClick={props.onClick}>
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
            variant="tinted"
            size="touch"
            disabled={props.busy}
            onClick={() => props.onYes(null)}
          >
            Ohne Gegengabe anfragen
          </Button>
        )}
        <Button variant="plain" size="touch" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </Banner>
  );
}
