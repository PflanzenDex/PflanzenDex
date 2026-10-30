// Public interface of the `collection` module (ADR 0003): page for collection and create specimen, and the parts of the
// plants that the app wires around it (the opener "Ansicht" and its layer, US-QS-19).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const CollectionPage = lazyPage(() =>
  import("./collection-page/collection-page").then((m) => ({ default: m.CollectionPage })),
);
export const PlantsViewOpener = lazyPage(() =>
  import("./plants-screen/plants-parts/view-opener/view-opener").then((m) => ({
    default: m.PlantsViewOpener,
  })),
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
export const DifficultyPage = lazyPage(() =>
  import("./other-pages/difficulty-page/difficulty-page").then((m) => ({
    default: m.DifficultyPage,
  })),
);
export { loadCards, loadSpecimenCount } from "./specimens/cards/cards-api";
export { createSpecimen, setSpecimenLocation } from "./specimens/model/specimens-api";
export type { PlantSlots } from "./plants-screen/plant-layers/layer-ids";
