import type { FriendCard as Card } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { dateText } from "../../../../../parts/invite-card/invite-card";
import table from "../../../../../social.de.json";

const tx = texts(table);

/**
 * "du hast sie" / "du hast sie nicht": both are open states, neutral (SG-COLOR-01, SG-COLOR-04: no deviation to look at).
 * An unknown comparison is outlined (P-08). The text carries the meaning, colour only supports it.
 */
const ownership = (iHave: boolean | null) =>
  iHave === null
    ? { text: tx("friendCard.unknown"), variant: "outline" as const }
    : iHave
      ? { text: tx("friendCard.have"), variant: "default" as const }
      : { text: tx("friendCard.lack"), variant: "default" as const };

/** The number of the friend's specimens, and of its cuttings among them (P-08: a count, never a guess). */
const countText = (card: Card) => {
  const plants =
    card.specimens === 1
      ? tx("friendCard.onePlant")
      : tx("friendCard.plants", { count: card.specimens });
  if (card.cuttings === 0) return plants;
  const cuttings =
    card.cuttings === 1
      ? tx("friendCard.oneCutting")
      : tx("friendCard.cuttings", { count: card.cuttings });
  return `${plants}, ${tx("friendCard.including", { cuttings })}`;
};

/**
 * A card of a friend's shared species (US-SOZ-07, in the style of the collector cards of US-POK-01): the species, how many
 * specimens the friend shares, since when, and whether I have it. Facts only: no rank, no rating (FR-SOZ-11).
 */
export function FriendCard(props: { card: Card; busy: boolean; onWish: (card: Card) => void }) {
  const { card } = props;
  const o = ownership(card.iHave);
  return (
    <div
      data-have={card.iHave === null ? "unknown" : String(card.iHave)}
      className={cn(
        "grid h-full min-w-0 content-start gap-0.5 break-words rounded-card bg-card p-2 text-sm text-card-foreground shadow-elevation-1",
      )}
    >
      <span className="font-semibold">{card.speciesLatin ?? tx("friendCard.unknownSpecies")}</span>
      {card.speciesGerman !== null && <span>{card.speciesGerman}</span>}
      <span className="text-xs">{countText(card)}</span>
      <span className="text-xs text-muted-foreground">
        {card.firstCaught === null
          ? tx("friendCard.dateUnknown")
          : tx("friendCard.since", { date: dateText(`${card.firstCaught}T12:00:00`) })}
      </span>
      <span className="flex flex-wrap gap-1.5">
        <Badge variant={o.variant}>{o.text}</Badge>
      </span>
      {card.iHave === false && card.speciesLatin !== null && (
        <span className="mt-1">
          <Button
            type="button"
            size="touch"
            variant="tinted"
            disabled={props.busy}
            aria-label={tx("friendCard.wishLabel", { name: card.speciesLatin })}
            onClick={() => props.onWish(card)}
          >
            {tx("friendCard.wish")}
          </Button>
        </span>
      )}
    </div>
  );
}
