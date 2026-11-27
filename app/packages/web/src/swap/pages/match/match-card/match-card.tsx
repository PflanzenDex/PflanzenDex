import type { MatchCard as Card } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { CardPicture } from "@/shared/patterns/display/card/card-picture/card-picture";
import { Fact, FactList } from "@/shared/patterns/display/card/card-facts/card-facts";
import { CardMore } from "@/shared/patterns/display/card/card-more/card-more";
import { WikipediaSource } from "@/pokedex";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { MODE_TEXT, TYPE_TEXT } from "../../../parts/offer-form/health-text";
import table from "../../../swap.de.json";
import { cardTitle } from "../match-deck/deck-state";
import { MatchDetails } from "./match-details/match-details";

const t = texts(table);

/**
 * The height the rest of the card needs inside its padding, in rem (see `CardPicture`): the credit, the gaps, the name block of
 * three lines and the row of facts. The picture takes what the deck leaves beyond it.
 */
const REST = "9.5rem";

/**
 * The one reason on the front (US-TAU-04, US-TAU-05, owner decision d-160): the most specific one. "Passt in beide Richtungen"
 * wins over "Auf deiner Wunschliste"; the other one is in the sheet of "Mehr". The wish names no species: it is the species
 * of the card. A card with neither reason shows no badge.
 */
function Reason({ card: c }: { card: Card }) {
  if (c.reasons.some((r) => r.kind === "both_ways"))
    return (
      <Badge variant="default" className="max-w-full whitespace-normal">
        {t("card.reasonBothWays")}
      </Badge>
    );
  // The other kind of reason is the wish on the keeper's list: the species of the card.
  if (c.reasons.length > 0)
    return (
      <Badge variant="outline" className="max-w-full whitespace-normal">
        {t("card.reasonWishlist")}
      </Badge>
    );
  return null;
}

/**
 * The catalog picture with its credit directly under it (US-QS-32, SG-PHOTO-01 to SG-PHOTO-03): a link to its Wikipedia
 * page, never a copy (P-05); without a picture the drawn placeholder stands in, never an emoji. The box is the full width of
 * the card (issue 2421).
 */
function Picture({ c, fit }: { c: Card; fit: boolean }) {
  const shown = c.imageUrl !== null;
  return (
    <CardPicture
      src={c.imageUrl}
      alt={t("card.imageAlt", { species: cardTitle(c) })}
      {...(fit ? { reserve: REST } : {})}
      overlay={<Reason card={c} />}
      credit={
        c.imageSourceUrl !== null || shown ? (
          <WikipediaSource
            label={t("card.pictureCredit")}
            sourceUrl={c.imageSourceUrl}
            shown={shown}
            className="-my-3 inline-flex min-h-11 items-center text-muted-foreground"
          />
        ) : undefined
      }
    />
  );
}

/**
 * One offer of a friend as a two-level card (US-TAU-01, US-QS-32, owner decisions d-066 and d-160): the front shows the
 * catalog picture with its credit, the one reason, the name, the giver, the offer as one fact ("Steckling · Tauschen") and,
 * while a treatment is open, "Behandlung offen" as the second fact. The health, the note, the wish and the other reason are in
 * the sheet of "Mehr". No score; the gesture and its stamps are the shared `SwipeCard` around it (US-TAU-02). The card never
 * scrolls: the deck fits one screen, and at large text the page scrolls as a whole (US-QS-15).
 */
export function MatchCard(props: {
  card: Card;
  /**
   * The card takes the free height of its deck (one screen, the default). At large text it takes its own height instead, so
   * the page scrolls as a whole and the decision buttons follow the card (US-QS-32, SG-TYPE-04).
   */
  fill?: boolean;
}) {
  const c = props.card;
  const title = cardTitle(c);
  const fill = props.fill ?? true;
  return (
    <article
      aria-labelledby="match-title"
      className={cn(
        // One column that shrinks to the card: a credit or a name at 200 % text wraps instead of widening the card (US-QS-32).
        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)] touch-pan-y content-start gap-2 break-words",
        "rounded-card border border-border bg-card p-4 text-card-foreground",
        // The least height the content needs with the picture at its floor: a frame that is lower scrolls, the card never cuts.
        fill && "min-h-[17.25rem] flex-1 basis-0 [container-type:size]",
      )}
    >
      <Picture c={c} fit={fill} />
      {/* "Mehr" stands beside the name and costs no line of its own; at large text it drops below the name. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2">
        <div className="grid min-w-0 flex-[1_1_12rem] justify-items-start gap-1">
          <h2
            id="match-title"
            tabIndex={-1}
            className="m-0 text-xl font-semibold focus:outline-none"
          >
            {title}
          </h2>
          {c.speciesLatin && c.speciesGerman && (
            <p className="m-0 text-sm italic">{c.speciesLatin}</p>
          )}
          <p className="m-0 text-sm">
            {t("card.byline", { name: c.ownerName ?? t("card.ownerFallback") })}
          </p>
        </div>
        <CardMore name={title}>
          <MatchDetails card={c} />
        </CardMore>
      </div>
      <FactList>
        <Fact>{t("card.fact", { type: TYPE_TEXT[c.type], mode: MODE_TEXT[c.mode] })}</Fact>
        {c.health.treatmentOpen && <Fact>{t("card.treatmentOpen")}</Fact>}
      </FactList>
    </article>
  );
}
