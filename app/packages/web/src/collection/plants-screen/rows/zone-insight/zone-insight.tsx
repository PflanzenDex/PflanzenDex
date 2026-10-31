import type { Distribution } from "@pflanzendex/core";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { zoneLabel } from "@pflanzendex/core";

/** The id of the layer with the distribution per light zone (`?sheet=zones`, US-QS-19). */
export const ZONES_LAYER = "zones";

/** One line about the light zones: the thinnest zone named in text, or the way to the distribution (P-08, P-09). */
export function zoneInsightText(distribution: Distribution): string {
  const names = distribution.thinnest.map((z) => zoneLabel(z.name));
  return names.length > 0 ? `Dünnste Zone: ${names.join(", ")}` : "Lichtzonen ansehen";
}

/** The insight row of the plants (US-QS-19): one line, a target of at least 44 px, opens the layer "zones". */
export function ZoneInsightRow({ distribution }: { distribution: Distribution }) {
  const { openLayer, open } = useLayer(ZONES_LAYER);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="min-w-0 flex-1 justify-start gap-2 rounded-card bg-secondary px-3 text-left font-normal text-secondary-foreground hover:bg-secondary/80"
    >
      <Gauge aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{zoneInsightText(distribution)}</span>
    </Button>
  );
}
