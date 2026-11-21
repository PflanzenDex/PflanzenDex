import type { ReactNode } from "react";
import type {
  ArchivedEntry,
  Distribution,
  LightLocation,
  SpecimenCard,
  SpecimenSummary,
} from "@pflanzendex/core";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";

export const ARCHIVE_LAYER = "archive";

/** The calm hints of one plant (US-ONB-07): the only active plant, and a plant none is measured yet. */
export type PlantHintOccasion = "first_plant_saved" | "first_measurement";

/** The note of one occasion for its place in the layer: the note while it is the due one, else nothing. */
export type PlantNote = (occasion: PlantHintOccasion) => ReactNode;

/**
 * The calm hint of the plant layer (US-ONB-07), wired by the app: it asks the server once which of the `applicable`
 * occasions is due, and `children` places its note ("Messen", the tab "Verlauf"). It renders the content at once.
 */
export type PlantHint = (props: {
  applicable: readonly PlantHintOccasion[];
  children: (note: PlantNote) => ReactNode;
}) => ReactNode;

/**
 * The occasions that apply to the layer of the plants (US-ONB-07), from the summary over all plants (FR-BES-23): the only
 * active plant has `first_plant_saved`; a plant while none is measured has `first_measurement`. Archived plants count nowhere.
 */
export function plantHintOccasionsOf(
  summary: Pick<SpecimenSummary, "total" | "anyMeasured">,
): PlantHintOccasion[] {
  return [
    ...(summary.total === 1 ? (["first_plant_saved"] as const) : []),
    ...(summary.total > 0 && !summary.anyMeasured ? (["first_measurement"] as const) : []),
  ];
}

export type Handlers = {
  onMeasure?: ((e: SpecimenCard) => void) | undefined;
  onArchive?: ((e: SpecimenCard) => void) | undefined;
  onRepot?: ((e: SpecimenCard) => void) | undefined;
  onMark?: ((e: SpecimenCard) => void) | undefined;
  onCatchDate?: ((e: SpecimenCard) => void) | undefined;
  onLightZone?: ((e: SpecimenCard) => void) | undefined;
};

/** What a slot may ask the plant layer for: leave the layer and measure (the layer closes first, P-10). */
export type SlotContext = { measure: () => void };
export type SlotRender = (card: SpecimenCard, context: SlotContext) => ReactNode;
/**
 * The shape of a part while its chunk loads; it gets the layer's loading label, which the layer owns (`slot.loading`), and
 * the plant's card, so the shape can follow the state of the plant (US-QS-23).
 */
export type SlotFallback = (label: string, card: SpecimenCard) => ReactNode;

/**
 * Parts of the plant layer that belong to other modules (US-QS-23): the app wires them, because `collection` does not
 * know `care` or `monitoring`. A slot that is not wired leaves its part out.
 */
export type PlantSlots = {
  /** The growth trend from the own history (`care`). */
  growth?: SlotRender | undefined;
  /**
   * The shape of the growth trend while its chunk loads (`care`, US-QS-32): the frame of the loaded line, so the overview
   * keeps its height. Without it the layer draws its one-line shape.
   */
  growthFallback?: SlotFallback | undefined;
  /** The measurements and photos, paged (`care`). */
  history?: SlotRender | undefined;
  /** Open and done treatments and the care phase (`care`). */
  care?: SlotRender | undefined;
  /** The button "Gießen" (`monitoring`). */
  water?: SlotRender | undefined;
  /** The calm hint of the layer (US-ONB-07, `today-intro`): its note stands under "Messen" or first in "Verlauf". */
  hint?: PlantHint | undefined;
  /**
   * Starts the request of the calm hint before a layer opens (US-ONB-07, US-QS-23): the plants screen calls it with the
   * occasions that apply when it shows, so the layer finds the answer and its note is there on its first render. The app
   * wires it (`today-intro`).
   */
  hintPrefetch?: ((applicable: readonly PlantHintOccasion[]) => void) | undefined;
};

export type LayerProps = Handlers & {
  slots?: PlantSlots | undefined;
  /** The occasions of the calm hint that apply to the plants (US-ONB-07); see `plantHintOccasionsOf`. */
  hintOccasions?: readonly PlantHintOccasion[] | undefined;
  /** The own locations and the write that sets one (US-PHA-03, US-LIC); without them the layer offers no location change. */
  locations?: readonly LightLocation[] | undefined;
  onLocate?: ((specimenId: string, locationId: string, success: string) => void) | undefined;
  cards: readonly SpecimenCard[];
  distribution: Distribution;
  archived: readonly ArchivedEntry[];
  photoAccess: PhotoAccess;
  onManage: () => void;
  onRestore: (e: { id: string; name: string }) => void;
  onArchivedCatchDate: (e: { id: string; name: string; caughtAt: string | null }) => void;
};
