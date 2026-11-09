import { zoneLabel } from "@pflanzendex/core";
import type { SpecimenCard } from "@pflanzendex/core";
import { cva } from "class-variance-authority";
import { Button } from "@/shared/ui/button/button";
import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useInView } from "@/shared/platform/visibility/use-in-view";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { UNKNOWN } from "../../../specimens/model/text";

/** The layer of one plant is named after the plant: `?sheet=plant-<id>` (US-QS-19). */
export const plantLayerId = (id: string): string => `plant-${id}`;

/** The one state a tile shows (US-QS-19): an open treatment first, then the quality of the last measurement. */
export function tileState(card: SpecimenCard): { text: string; attention: boolean } {
  if (card.treatment) return { text: "Behandeln", attention: true };
  const quality = card.lastMeasurement?.quality;
  if (quality === "etiolated") return { text: "Vergeilt/dünn", attention: true };
  if (quality === "healthy") return { text: "Gesund", attention: false };
  return { text: UNKNOWN, attention: false };
}

/** The zone as text without the source: the tile has room for the name only; unknown stays "unbekannt" (P-08). */
export const tileZone = (card: SpecimenCard): string =>
  card.lightZone ? zoneLabel(card.lightZone) : UNKNOWN;

/**
 * The two lines of the name of a tile (US-QS-19, issue 1651): the species, then the marker that tells the plants apart.
 * The split follows the naming rule DM-BES-03 (`Species – marker`). A marker that the name does not end in still gets
 * its own line, so nothing disappears (P-10).
 */
export function tileNameLines(card: SpecimenCard): { species: string; marker: string | null } {
  const marker = card.marker || null;
  const suffix = marker === null ? null : ` – ${marker}`;
  if (suffix !== null && card.name.endsWith(suffix)) {
    return { species: card.name.slice(0, -suffix.length), marker };
  }
  return { species: card.name, marker };
}

/** Attention is marked by the warning tokens and the word, never by colour alone (DS-38). */
const stateMark = cva("w-fit max-w-full truncate rounded-sm px-1 text-xs font-semibold", {
  variants: {
    attention: { true: "border-b-2 border-warning-border bg-warning text-warning-foreground" },
  },
  defaultVariants: { attention: false },
});

/** The 56 px picture of a tile (NFR-12): the thumbnail, requested once the tile is near the viewport. */
function Face({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const state = useStoredPhoto(access, card.photo?.url, { size: "thumb", enabled: inView });
  const initial = card.name.trim().charAt(0).toUpperCase() || "?";
  return typeof state === "string" ? (
    <img src={state} alt="" className="size-14 shrink-0 rounded-md object-cover" />
  ) : (
    <span
      ref={ref}
      aria-hidden="true"
      data-initial={initial}
      className="grid size-14 shrink-0 place-items-center rounded-md text-xl font-semibold text-muted-foreground after:content-[attr(data-initial)]"
    />
  );
}

/**
 * A compact plant tile (US-QS-19): photo or the initial of the name, the species, the marker on a line of its own
 * (owner decision 2026-11-09, issue 1651), the light zone as text and one state. Species, marker and zone keep one
 * line each and end in "…" when they are longer than the tile, never breaking inside a word. A tile without a marker
 * has no marker line. The box fills its grid row (the `li` of the pager is stretched by the grid), so the tiles of a row
 * are equally high, and the content starts at the top, so the species lines of a row line up. The accessible name is the
 * visible text (WCAG 2.5.3, US-QS-08), so the full name `Species – marker` stays in it: the dash is read by assistive
 * technology only. The layer shows the full name (owner decision 2026-11-01, issue 1108). Choosing it opens the plant in its layer (`?sheet=plant-<id>`). Takes the card and the photo access only. A tile too
 * narrow for picture and text side by side, as at 200 % text on a phone, stacks them, so the name keeps the full width
 * and pots of one species stay apart by their marker (owner decision 2026-11-05, issue 1304).
 */
export function PlantTile({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const { openLayer, open } = useLayer(plantLayerId(card.id));
  const state = tileState(card);
  const { species, marker } = tileNameLines(card);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="@container h-full w-full min-w-0 items-start justify-start whitespace-normal rounded-card bg-secondary px-2 py-1.5 text-left font-normal text-secondary-foreground hover:bg-secondary/80"
    >
      <span className="flex w-full min-w-0 items-center gap-2 @max-[7.5rem]:flex-col @max-[7.5rem]:items-start">
        <Face card={card} access={access} />
        <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
          <span className="truncate font-semibold">{species}</span>{" "}
          {marker === null ? null : (
            <>
              <span data-marker className="truncate text-xs">
                <span className="sr-only">–</span> {marker}
              </span>{" "}
            </>
          )}
          <span className="truncate text-xs text-muted-foreground">{tileZone(card)}</span>{" "}
          <span
            data-attention={state.attention}
            className={stateMark({ attention: state.attention })}
          >
            {state.text}
          </span>
        </span>
      </span>
    </Button>
  );
}
