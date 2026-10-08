// Public interface of the `collection` module (ADR 0003): page for collection and create specimen.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const CollectionPage = lazyPage(() =>
  import("./collection-page/collection-page").then((m) => ({ default: m.CollectionPage })),
);
export const HintsPage = lazyPage(() =>
  import("./hints-page/hints-page").then((m) => ({ default: m.HintsPage })),
);
export const CareProfileSection = lazyPage(() =>
  import("./care-profile-page/care-profile-page").then((m) => ({ default: m.CareProfileSection })),
);
export const DifficultyPage = lazyPage(() =>
  import("./difficulty-page/difficulty-page").then((m) => ({ default: m.DifficultyPage })),
);
export { loadSpecimenCount } from "./cards-api";
