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
export type { PlantSlots } from "./plants-screen/plant-layers/layer-ids";
export { VIEW_LAYER, ViewLayer } from "./plants-screen/plant-layers/view-layer/view-layer";
export {
  formText,
  type FormAddress,
  type FormPlant,
} from "./plants-screen/plant-layers/plant-forms/address/form-address";
export { usePlantForm } from "./plants-screen/plant-layers/plant-forms/address/use-plant-form";
export { UnsavedInputDialog } from "./plants-screen/plant-layers/plant-forms/unsaved-input-dialog/unsaved-input-dialog";
