import { useId } from "react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import { CardPicture } from "@/shared/patterns/display/card/card-picture/card-picture";
import { CardFacts } from "@/shared/patterns/display/card/card-facts/card-facts";
import { CardMore } from "@/shared/patterns/display/card/card-more/card-more";
import { Badge } from "@/shared/ui/badge";
import { SpeciesName, germanNameOf } from "@/shared/species-name/species-name";
import { dateText } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./collector-card.de.json";
import { CollectorDetails } from "./collector-details/collector-details";
import { WikipediaSource } from "./wikipedia-source/wikipedia-source";

const t = texts(table);

/**
 * The picture with its credit directly under it (US-QS-32, F-0133, SG-PHOTO-01 to SG-PHOTO-03): the shared card picture
 * keeps a 4:3 box at the full width of the card at every size and text size, with room reserved before the image comes; the
 * image is a link to its source, not a copy (P-05); without one the drawn placeholder stands in, never an emoji. An uncaught
 * card keeps its picture in grey (owner answer Q-91, the one exception to SG-COLOR-07).
 */
function Picture({ card: c }: { card: Card }) {
  return (
    <div className={cn("min-w-0", c.state === "missing" && "[&_img]:grayscale")}>
      <CardPicture
        src={c.imageUrl}
        alt={t("card.imageAlt", { species: c.species })}
        credit={
          c.imageUrl === null ? undefined : (
            <WikipediaSource
              label={t("card.pictureCredit")}
              sourceUrl={c.sourceUrl}
              shown
              className="inline-flex min-h-11 items-center text-muted-foreground"
            />
          )
        }
      />
    </div>
  );
}

/**
 * The number and the catch in one badge: the number, a dot and "gefangen 12.03.2026" or "noch nicht gefangen" (US-POK-01, owner
 * decision d-160). The date is "TT.MM.JJJJ" by the shared formatter (SG-FMT-01), "gefangen ≈ …" where it is the creation date, and an
 * unknown date says so (US-POK-07, P-08). A caught card says "gefangen" even without a date.
 */
function catchBadge(c: Card): string {
  const number = `#${String(c.number).padStart(3, "0")}`;
  if (c.caughtDate === null) return t("badge.missing", { number });
  if (c.caughtDate.date === null) return t("badge.caughtUnknown", { number });
  const date = dateText(c.caughtDate.date);
  return t(c.caughtDate.source === "created_at" ? "badge.caughtApprox" : "badge.caught", {
    number,
    date,
  });
}

/**
 * Collector card of one species as a two-level card (US-POK-01, US-QS-32, owner decisions d-066 and d-160): the front shows the
 * picture with its credit, the number and the catch in one badge, the name, the two facts (light zone, difficulty) and "Mehr";
 * the text, the genus count, the rarity lines, the number of plants and "Quellen" are in the sheet that "Mehr" opens. Caught is
 * colored, missing keeps name and facts visible and shows the picture in grey. A caught species of a species-poor genus gets
 * a rarity frame. The card never scrolls; it is one card of a card row (`CardRow`).
 */
export function CollectorCard(props: { card: Card }) {
  const c = props.card;
  const titleId = useId();
  const caught = c.state === "caught";
  const rare = caught && c.speciesPoor;
  const name = germanNameOf(c.species, c.germanName) ?? c.species;
  return (
    <article
      aria-labelledby={titleId}
      data-state={c.state}
      {...(rare ? { "data-rarity": "" } : {})}
      className={cn(
        "grid min-w-0 grid-cols-1 content-start gap-2 break-words rounded-card bg-card p-3 text-card-foreground shadow-elevation-1",
        rare && "border-2 border-warning-border",
      )}
    >
      <Picture card={c} />
      <Badge
        variant={caught ? "default" : "outline"}
        className="w-fit max-w-full whitespace-normal tabular-nums"
      >
        {catchBadge(c)}
      </Badge>
      <div id={titleId} className="grid">
        <SpeciesName scientific={c.species} german={c.germanName} tooltip={c.germanNameFull} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2">
        <CardFacts lightZone={c.lightZone} difficulty={c.difficulty} />
        <CardMore name={name}>
          <CollectorDetails card={c} />
        </CardMore>
      </div>
    </article>
  );
}
