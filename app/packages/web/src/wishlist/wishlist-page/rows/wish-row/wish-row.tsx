import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
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
  return (
    <div
      data-priority={c.priority.kind}
      className="flex min-w-0 flex-wrap items-center gap-1 rounded-card border border-border bg-card p-2 text-card-foreground"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Details: ${c.title}`}
        className="h-auto min-w-0 flex-1 basis-32 flex-col items-start justify-start gap-0 whitespace-normal px-1 py-1 text-left"
        onClick={(event) => openLayer(event.currentTarget)}
      >
        <span className="break-words font-semibold">{`${rank}. ${c.title}`}</span>
        <span className="break-words text-sm font-normal text-muted-foreground">
          {`${c.zoneText} · ${level}`}
        </span>
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
