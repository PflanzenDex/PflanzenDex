import type { FriendCard as Card } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateText } from "../../../parts/invite-card/invite-card";

/** "du hast sie" / "du hast sie nicht", or the comparison is unknown (P-08): text carries the meaning, colour only supports it. */
const ownership = (iHave: boolean | null) =>
  iHave === null
    ? { text: "Vergleich unbekannt", variant: "outline" as const }
    : iHave
      ? { text: "Du hast sie", variant: "default" as const }
      : { text: "Du hast sie nicht", variant: "warning" as const };

/**
 * A card of a friend's shared species (US-SOZ-07, in the style of the collector cards of US-POK-01): the species, how many
 * specimens the friend shares, since when, and whether I have it. Facts only: no rank, no rating (FR-SOZ-11).
 */
export function FriendCard(props: { card: Card; busy: boolean; onWish: (card: Card) => void }) {
  const { card } = props;
  const o = ownership(card.iHave);
  return (
    <li
      data-have={card.iHave === null ? "unknown" : String(card.iHave)}
      className={cn(
        "grid min-w-0 content-start gap-1 break-words rounded-card bg-card p-3 text-card-foreground shadow-elevation-1",
      )}
    >
      <span aria-hidden="true" className="text-4xl">
        🌱
      </span>
      <span className="font-semibold">{card.speciesLatin ?? "Art unbekannt"}</span>
      {card.speciesGerman !== null && <span>{card.speciesGerman}</span>}
      <span className="text-sm">
        {card.specimens === 1 ? "1 Exemplar" : `${card.specimens} Exemplare`}
        {card.cuttings > 0
          ? `, davon ${card.cuttings === 1 ? "1 Steckling" : `${card.cuttings} Stecklinge`}`
          : ""}
      </span>
      <span className="text-sm text-muted-foreground">
        {card.firstCaught === null
          ? "Fangdatum unbekannt"
          : `Gefangen seit ${dateText(`${card.firstCaught}T12:00:00`)}`}
      </span>
      <span className="flex flex-wrap gap-1.5">
        <Badge variant={o.variant}>{o.text}</Badge>
      </span>
      {card.iHave === false && card.speciesLatin !== null && (
        <span className="mt-1">
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={props.busy}
            aria-label={`${card.speciesLatin} auf die Wunschliste setzen`}
            onClick={() => props.onWish(card)}
          >
            Auf die Wunschliste
          </Button>
        </span>
      )}
    </li>
  );
}
