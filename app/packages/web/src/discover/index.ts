// Public interface of the module `discover` (ADR 0003): the page with the suggestions as cards (US-ENT-01).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const DiscoverPage = lazyPage(() =>
  import("./discover-page/discover-page").then((m) => ({ default: m.DiscoverPage })),
);
