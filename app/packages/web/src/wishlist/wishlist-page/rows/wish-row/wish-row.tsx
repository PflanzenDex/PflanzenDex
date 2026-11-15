import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { SpeciesName, germanNameOf } from "@/shared/species-name/species-name";
import { LEVELS, UNKNOWN } from "../../../candidate-card/candidate-card";
import { Discard } from "../../../candidate-card/discard/discard";

/** The layer of one wish is named after the wish: `?sheet=wish-<id>` (US-QS-22). */
export const wishLayerId = (id: string): string => `wish-${id}`;

/**
 * A compact wish (US-QS-22): the rank, the title, the target zone and the difficulty; choosing the text opens the full
 * card in its layer. "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05, asks first) stay on the row.
 */
export function WishRow(props: {
  c: Candidate;
  rank: number;
  onBuy: (c: Candidate) => void;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
}) {
  const { c, rank } = props;
  const { openLayer, open } = useLayer(wishLayerId(c.id));
  const level = c.difficulty ? (LEVELS[c.difficulty] ?? UNKNOWN) : UNKNOWN;
  // The label reads in the order the row shows: the name, the scientific name, the zone (WCAG 2.5.3, US-QS-32).
  const german = germanNameOf(c.name, c.german);
  const named = german === null ? c.name : `${german} ${c.name}`;
  return (
    <div
      data-priority={c.priority.kind}
      data-scroll-x="row"
      className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-card border border-border bg-card p-2 text-card-foreground"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${rank}. ${named} ${c.zoneText} · Schwierigkeit: ${level}`}
        className="h-auto min-w-0 shrink-0 grow basis-28 flex-col items-start justify-start gap-0 whitespace-normal px-1 py-1 text-left"
        onClick={(event) => openLayer(event.currentTarget)}
      >
        <SpeciesName
          lead={`${rank}. `}
          scientific={c.name}
          german={c.german}
          meta={<>{`${c.zoneText} · Schwierigkeit: ${level}`}</>}
        />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.busy}
        aria-label={`Gekauft: ${c.title}`}
        onClick={() => props.onBuy(c)}
      >
        Gekauft
      </Button>
      <Discard c={c} onDiscard={props.onDiscard} busy={props.busy} compact />
    </div>
  );
}
