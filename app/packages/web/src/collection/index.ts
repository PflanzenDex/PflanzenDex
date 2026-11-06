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
export const DifficultyPage = lazyPage(() =>
  import("./other-pages/difficulty-page/difficulty-page").then((m) => ({
    default: m.DifficultyPage,
  })),
);
export { loadCardSummary, loadSpecimenCount } from "./specimens/cards/cards-api";
export { createSpecimen, setSpecimenLocation } from "./specimens/model/specimens-api";
export type { PlantSlots } from "./plants-screen/plant-layers/layer-ids";
export { VIEW_LAYER, ViewLayer } from "./plants-screen/plant-layers/view-layer/view-layer";
