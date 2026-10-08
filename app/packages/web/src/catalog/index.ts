// Public interface of the `catalog` module (ADR 0003): pages for the species catalog and its review.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const SpeciesPage = lazyPage(() =>
  import("./species-page/species-page").then((m) => ({ default: m.SpeciesPage })),
);
export const ReviewPage = lazyPage(() =>
  import("./review/review-page/review-page").then((m) => ({ default: m.ReviewPage })),
);
// The app finds the species of a bought wish (US-WUN-05); the calls load when the way is used (DS-08).
export const searchSpecies = async (
  ...args: Parameters<typeof import("./species-api").searchSpecies>
) => (await import("./species-api")).searchSpecies(...args);
export const loadSpecies = async (
  ...args: Parameters<typeof import("./species-api").loadSpecies>
) => (await import("./species-api")).loadSpecies(...args);
