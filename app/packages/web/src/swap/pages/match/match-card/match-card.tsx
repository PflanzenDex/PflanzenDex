import type { MatchCard as Card } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import {
  CardPicture,
  PICTURE_HEIGHT_CAP,
} from "@/shared/patterns/display/card/card-picture/card-picture";
import { WikipediaSource } from "@/pokedex";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../../../parts/offer-form/health-text";
import table from "../../../swap.de.json";
import { cardTitle } from "../match-deck/deck-state";

const t = texts(table);

/** Why the card appears and what makes it special: the wish with the own reasoning, and "fits both ways" as a fact (US-TAU-04, US-TAU-05). */
function Reasons(props: { card: Card }) {
  const c = props.card;
  const wishes = c.reasons.flatMap((r) => (r.kind === "wishlist" ? [r] : []));
  const both = c.reasons.flatMap((r) => (r.kind === "both_ways" ? [r] : []));
  return (
    <section aria-label="Grund" className="flex flex-wrap items-center gap-2">
      {wishes.map((r) => (
        <Badge
          key={r.species}
          variant="outline"
          className="max-w-full whitespace-normal"
        >{`Auf deiner Wunschliste: ${r.species}`}</Badge>
      ))}
      {wishes.map(
        (r) =>
          r.reasoning !== null && (
            <p key={`${r.species}-why`} className="m-0 w-full whitespace-pre-line text-sm">
              {`Dein Grund: ${r.reasoning}`}
            </p>
          ),
      )}
      {both.length > 0 && (
        <Badge variant="default" className="max-w-full whitespace-normal">
          Passt in beide Richtungen
        </Badge>
      )}
      {both.map((r) => (
        <p key={r.offerId} className="m-0 w-full text-sm">
          {`${c.ownerName ?? "Ein Freund"} möchte ${r.speciesGerman ?? r.speciesLatin ?? "dein Angebot"} von dir.`}
        </p>
      ))}
    </section>
  );
}

/**
 * The catalog picture with its credit directly under it (US-QS-32, SG-PHOTO-01 to SG-PHOTO-03): a link to its Wikipedia
 * page, never a copy (P-05); without a picture the drawn placeholder stands in, never an emoji. At the normal text size the
 * box has the height cap of the suggestion card; at large text the card takes its own height and the picture is not capped.
 */
function Picture({ c, large }: { c: Card; large: boolean }) {
  const shown = c.imageUrl !== null;
  return (
    <CardPicture
      src={c.imageUrl}
      alt={t("card.imageAlt", { species: cardTitle(c) })}
      boxClassName={large ? undefined : PICTURE_HEIGHT_CAP}
      credit={
        c.imageSourceUrl !== null || shown ? (
          <WikipediaSource
            label={t("card.sourceLabel")}
            sourceUrl={c.imageSourceUrl}
            shown={shown}
            className="inline-flex min-h-11 items-center text-muted-foreground"
          />
        ) : undefined
      }
    />
  );
}

/**
 * One offer of a friend as a card (US-TAU-01): the catalog picture with its credit (US-QS-32), names, giver, type, mode, note,
 * health and the reason it is shown (US-TAU-04). No score; the gesture and its stamps are the shared `SwipeCard` around it
 * (US-TAU-02). `large`: the text size is 150 % or more (US-QS-21): the picture is not capped by the screen height.
 */
export function MatchCard(props: { card: Card; large?: boolean }) {
  const { card: c, large = false } = props;
  return (
    <article
      aria-labelledby="match-title"
      className={cn(
        // One column that shrinks to the card: a credit or a name at 200 % text wraps instead of widening the card (US-QS-32).
        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)] touch-pan-y content-start gap-2 break-words",
        "rounded-card border border-border bg-card p-4 text-card-foreground",
      )}
    >
      <Picture c={c} large={large} />
      <div>
        <h2 id="match-title" tabIndex={-1} className="m-0 text-xl font-semibold focus:outline-none">
          {c.speciesGerman ?? c.speciesLatin ?? "Art unbekannt"}
        </h2>
        {c.speciesLatin && c.speciesGerman && (
          <p className="m-0 text-sm italic">{c.speciesLatin}</p>
        )}
      </div>
      <p className="m-0">
        {`Von ${c.ownerName ?? "einem Freund"} · ${TYPE_TEXT[c.type]} · ${MODE_TEXT[c.mode]}`}
      </p>
      {c.wish && <p className="m-0 text-sm">{`Wunsch: ${c.wish}`}</p>}
      {c.note && <p className="m-0 text-sm">{`Hinweis: ${c.note}`}</p>}
      <p className="m-0 text-sm text-muted-foreground">{healthText(c.health)}</p>
      {c.phase === "dormancy" && (
        <p className="m-0 text-sm text-muted-foreground">Zurzeit in der Ruhephase.</p>
      )}
      <Reasons card={c} />
    </article>
  );
}
