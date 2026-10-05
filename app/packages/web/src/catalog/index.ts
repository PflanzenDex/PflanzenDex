// Public interface of the `catalog` module (ADR 0003): pages for the species catalog and its review.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const SpeciesPage = lazyPage(() =>
  import("./SpeciesPage").then((m) => ({ default: m.SpeciesPage })),
);
export const ReviewPage = lazyPage(() =>
  import("./ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
