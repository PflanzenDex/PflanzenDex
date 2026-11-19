import type { Distribution } from "@pflanzendex/core";
import { zoneLabel } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import table from "./zone-insight.de.json";

const t = texts(table);

/** The id of the layer with the distribution per light zone (`?sheet=zones`, US-QS-19). */
export const ZONES_LAYER = "zones";

/**
 * The meta line of the row: the thinnest zone named in text, "Zone 4 am leersten" (P-08, P-09). Nothing while no zone holds
 * a plant, so the row says only what it opens.
 */
export function zoneInsightMeta(distribution: Distribution): string | undefined {
  const names = distribution.thinnest.map((z) => zoneLabel(z.name));
  return names.length > 0 ? t("leastLit", { zones: names.join(", ") }) : undefined;
}

/**
 * The light-zone row of the plants (US-QS-19, US-QS-32, F-0114): a flat row above the plants, titled "Lichtzonen", with the
 * thinnest zone as its meta line and a chevron. The whole row opens the layer "zones" (a button, because the layer needs
 * the element that opened it). It takes the full width of its line, so it never narrows to a word at a larger text size.
 */
export function ZoneInsightRow({ distribution }: { distribution: Distribution }) {
  const { openLayer, open } = useLayer(ZONES_LAYER);
  const meta = zoneInsightMeta(distribution);
  return (
    <GroupedList>
      <GroupedRow
        haspopup="dialog"
        expanded={open}
        title={t("title")}
        {...(meta !== undefined ? { meta } : {})}
        onClick={(event) => openLayer(event.currentTarget)}
      />
    </GroupedList>
  );
}
