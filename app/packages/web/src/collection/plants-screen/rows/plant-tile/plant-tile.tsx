import { zoneLabel, type SpecimenCard } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/display/badge/badge";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { useObjectPhoto } from "@/shared/lists/object-row/use-object-photo";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { UNKNOWN } from "../../../specimens/model/text";
import table from "./plant-tile.de.json";

const ui = texts(table);

/** The layer of one plant is named after the plant: `?sheet=plant-<id>` (US-QS-19). */
export const plantLayerId = (id: string): string => `plant-${id}`;

/** The one state a tile shows (US-QS-19): an open treatment first, then the quality of the last measurement. */
export function tileState(card: SpecimenCard): { text: string; attention: boolean } {
  if (card.treatment) return { text: ui("treatment"), attention: true };
  const quality = card.lastMeasurement?.quality;
  if (quality === "etiolated") return { text: ui("etiolated"), attention: true };
  if (quality === "healthy") return { text: ui("healthy"), attention: false };
  return { text: UNKNOWN, attention: false };
}

/**
 * The two parts of a name `Species – marker` (DM-BES-03), for a plant whose species name the card does not carry. The
 * split is by the marker the card names; a name that does not end in it stays whole, so nothing disappears (P-10).
 */
function speciesOf(card: SpecimenCard): string {
  if (card.speciesName !== null) return card.speciesName;
  const suffix = card.marker ? ` – ${card.marker}` : null;
  return suffix !== null && card.name.endsWith(suffix)
    ? card.name.slice(0, -suffix.length)
    : card.name;
}

/**
 * The title and the meta line of a plant row (US-QS-32, owner answer Q-68, SG-LIST-07). A plant with its own name (its
 * marker) shows that name as the title and its species in the meta line; a plant without one shows its name as the
 * title, which is the species name derived by DM-BES-03, and no species again. The zone is the meta line; an unknown zone
 * carries its label (owner answer Q08, P-08).
 */
export function tileLines(card: SpecimenCard): { title: string; meta: string } {
  const zone = card.lightZone ? zoneLabel(card.lightZone) : ui("zoneUnknown");
  if (card.marker) return { title: card.marker, meta: `${speciesOf(card)} · ${zone}` };
  return { title: card.name, meta: zone };
}

/**
 * A plant in the list "Alle" (US-QS-19, US-QS-32): one `ObjectRow` with the photo's thumbnail (the drawn placeholder while
 * there is none), the title and the meta line of `tileLines`, and the one state that needs attention as its trailing
 * badge (SG-COLOR-04). Choosing the row opens the plant in its layer (`?sheet=plant-<id>`); the photo is asked once the
 * row is near the viewport (NFR-12).
 */
export function PlantTile({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const { openLayer, open } = useLayer(plantLayerId(card.id));
  const [ref, src] = useObjectPhoto(access, card.photo?.url);
  const { title, meta } = tileLines(card);
  const state = tileState(card);
  return (
    <ObjectRow
      rootRef={ref}
      src={src}
      title={title}
      meta={meta}
      trailing={state.attention ? <Badge variant="warning">{state.text}</Badge> : undefined}
      haspopup="dialog"
      expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    />
  );
}

/**
 * A plant row while its page loads (SG-STATE-02, F-0124): the row's box, so a list that loads shows the shape of its rows
 * instead of an empty frame. Never a number in it (P-08).
 */
export function PlantTileSkeleton() {
  return <Skeleton className="h-20 w-full rounded-lg" />;
}
