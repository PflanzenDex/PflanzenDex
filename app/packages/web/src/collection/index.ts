// Public interface of the `collection` module (ADR 0003): page for collection and create specimen.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const CollectionPage = lazyPage(() =>
  import("./CollectionPage").then((m) => ({ default: m.CollectionPage })),
);
export const HintsPage = lazyPage(() =>
  import("./HintsPage").then((m) => ({ default: m.HintsPage })),
);
export const CareProfilePage = lazyPage(() =>
  import("./CareProfilePage").then((m) => ({ default: m.CareProfilePage })),
);
export const DifficultyPage = lazyPage(() =>
  import("./DifficultyPage").then((m) => ({ default: m.DifficultyPage })),
);
export { loadSpecimenCount } from "./cards-api";
