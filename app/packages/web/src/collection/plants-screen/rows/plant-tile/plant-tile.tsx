import type { SpecimenCard } from "@pflanzendex/core";
import { cva } from "class-variance-authority";
import { Button } from "@/components/ui/button/button";
import { useStoredPhoto, type PhotoAccess } from "@/lib/use-stored-photo";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
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
export const tileZone = (card: SpecimenCard): string => card.lightZone ?? UNKNOWN;

/** Attention is marked by the warning tokens and the word, never by colour alone (DS-38). */
const stateMark = cva("w-fit rounded-sm px-1 text-xs font-semibold", {
  variants: {
    attention: { true: "border-b-2 border-warning-border bg-warning text-warning-foreground" },
  },
});

function Face({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const state = useStoredPhoto(access, card.photo?.url);
  const initial = card.name.trim().charAt(0).toUpperCase() || "?";
  return typeof state === "string" ? (
    <img src={state} alt="" className="size-14 shrink-0 rounded-md object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-14 shrink-0 place-items-center rounded-md bg-muted text-xl font-semibold text-muted-foreground"
    >
      {initial}
    </span>
  );
}

/**
 * A compact plant tile (US-QS-19): photo or the initial of the name, the name, the light zone as text and one state.
 * Choosing it opens the plant in its layer (`?sheet=plant-<id>`). Takes the card and the photo access only.
 */
export function PlantTile({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const { openLayer, open } = useLayer(plantLayerId(card.id));
  const state = tileState(card);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`${card.name}, ${tileZone(card)}, ${state.text}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="h-auto w-full min-w-0 justify-start gap-2 whitespace-normal rounded-card bg-secondary p-2 text-left font-normal text-secondary-foreground hover:bg-secondary/80"
    >
      <Face card={card} access={access} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate font-semibold">{card.name}</span>
        <span className="truncate text-xs text-muted-foreground">{tileZone(card)}</span>
        <span
          data-attention={state.attention}
          className={stateMark({ attention: state.attention })}
        >
          {state.text}
        </span>
      </span>
    </Button>
  );
}
