// Public interface of the `collection` module (ADR 0003): page for collection and create specimen. `CollectionPage` is also
// the carrier of the parts of the plants that the app wires around it (US-QS-19, `part=`), because every export costs
// bytes in the initial JavaScript (QG-U6).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const CollectionPage = lazyPage(() =>
  import("./plants-screen/plants-parts/plants-parts").then((m) => ({ default: m.PlantsEntry })),
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
