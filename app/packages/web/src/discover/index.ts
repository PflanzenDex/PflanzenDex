// Public interface of the module `discover` (ADR 0003): the page with the suggestions as cards (US-ENT-01).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const DiscoverPage = lazyPage(() =>
  import("./discover-page/discover-page").then((m) => ({ default: m.DiscoverPage })),
);
// The skeleton of the suggestion card, the mode's skeleton on "Entdecken" (US-QS-14, issue 1697).
export { DiscoverPageSkeleton } from "./discover-page/discover-page.skeleton";
