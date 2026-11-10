// Public interface of the `collection` module (ADR 0003): page for collection and create specimen, and the parts of the
// plants that the app wires around it (the opener "Ansicht" and its layer, US-QS-19).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const CollectionPage = lazyPage(() =>
  import("./collection-page/collection-page").then((m) => ({ default: m.CollectionPage })),
);
export const PlantsViewLayer = lazyPage(() =>
  import("./plants-screen/plants-parts/plants-parts").then((m) => ({ default: m.PlantsViewLayer })),
);
export const HintsPage = lazyPage(() =>
  import("./other-pages/hints-page/hints-page").then((m) => ({ default: m.HintsPage })),
);
export const CareProfileSection = lazyPage(() =>
  import("./care-profile-page/care-profile-page").then((m) => ({ default: m.CareProfileSection })),
);
/** The page a scanned pot label opens (US-BES-17): the plant with "Gegossen" and "Messen", its own address `/label/:id`. */
export const PotLabelPage = lazyPage(() =>
  import("./other-pages/pot-label-page/pot-label-page").then((m) => ({
    default: m.PotLabelPage,
  })),
);
/** The print of the QR pot labels (US-BES-17, FR-BES-25): its own address `/collection/labels`, shown while "pot_labels" is on. */
export const PrintLabelsPage = lazyPage(() =>
  import("./other-pages/print-labels-page/print-labels-page").then((m) => ({
    default: m.PrintLabelsPage,
  })),
);
/** The import of plants from a CSV file (US-BES-18, FR-BES-26): its own address `/collection/import`, shown while "csv_import" is on. */
export const ImportPage = lazyPage(() =>
  import("./other-pages/import-page/import-page").then((m) => ({ default: m.ImportPage })),
);
/** The entry "Aus Datei importieren" where plants are added (US-BES-18); hidden while "csv_import" is off. */
export { ImportEntry } from "./other-pages/import-page/views/import-entry/import-entry";
export const DifficultyPage = lazyPage(() =>
  import("./other-pages/difficulty-page/difficulty-page").then((m) => ({
    default: m.DifficultyPage,
  })),
);
export { loadCardSummary, loadSpecimenCount } from "./specimens/cards/cards-api";
export { createSpecimen, setSpecimenLocation } from "./specimens/model/specimens-api";
/**
 * The marker step of a further plant (US-BES-03, US-QS-15): its own chunk, loaded with step 2 of the first plant. It
 * reads the rule of the chosen species and reports it to the flow, so neither the sibling read nor the field reach the
 * barrel's static graph (issue 1638). Lazy like the pages.
 */
export const MarkerSection = lazyPage(() =>
  import("./markers/marker/marker-section/marker-section").then((m) => ({
    default: m.MarkerSection,
  })),
);
export type { MarkerSectionProps } from "./markers/marker/marker-section/marker-section";
export {
  markerFormStart,
  markerInputOf,
  markerRefusalFields,
  refusesMarker,
  type MarkerRule,
} from "./markers/marker/marker-rule";
export { createStart } from "./specimens/model/create-start";
export type { CreateFields } from "./specimens/model/schemas";
export type { PlantSlots } from "./plants-screen/plant-layers/layer-ids";
export { VIEW_LAYER, ViewLayer } from "./plants-screen/plant-layers/view-layer/view-layer";
export {
  formText,
  type FormAddress,
  type FormPlant,
} from "./plants-screen/plant-layers/plant-forms/address/form-address";
export { usePlantForm } from "./plants-screen/plant-layers/plant-forms/address/use-plant-form";
export { UnsavedInputDialog } from "./plants-screen/plant-layers/plant-forms/unsaved-input-dialog/unsaved-input-dialog";
// The skeleton of the hints in the shape of their cards, the layer's skeleton on "Heute" (US-QS-14, issue 1697).
export { HintsPageSkeleton } from "./other-pages/hints-page/hints-page.skeleton";
// The skeleton of the care profile in the shape of its card, the section's skeleton on a species profile (US-QS-14, issue 1697).
export { CareProfileSectionSkeleton } from "./care-profile-page/care-profile-page.skeleton";
// The skeletons of the plants and of the species comparison, the mode's skeletons on "Sammlung" (US-QS-14, issue 1727).
export { CollectionPageSkeleton } from "./collection-page/collection-page.skeleton";
export { DifficultyPageSkeleton } from "./other-pages/difficulty-page/difficulty-page.skeleton";
// The hints about incomplete specimens as a count, the same request and key as the layer: the app icon's number (US-QS-29).
export { useHintCount } from "./insights/api/hint-count/hint-count";
