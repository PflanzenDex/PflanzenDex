import type { ReactNode } from "react";
import type { ArchivedEntry, Distribution, LightLocation, SpecimenCard } from "@pflanzendex/core";
import type { PhotoAccess } from "@/lib/use-stored-photo";

export const ARCHIVE_LAYER = "archive";

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
 * Parts of the plant layer that belong to other modules (US-QS-23): the app wires them, because `collection` does not
 * know `care` or `monitoring`. A slot that is not wired leaves its part out.
 */
export type PlantSlots = {
  /** The growth trend from the own history (`care`). */
  growth?: SlotRender | undefined;
  /** The measurements and photos, paged (`care`). */
  history?: SlotRender | undefined;
  /** Open and done treatments and the care phase (`care`). */
  care?: SlotRender | undefined;
  /** The button "Gießen" (`monitoring`). */
  water?: SlotRender | undefined;
};

export type LayerProps = Handlers & {
  slots?: PlantSlots | undefined;
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
