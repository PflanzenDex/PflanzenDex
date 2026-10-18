// Public interface of the module `shell` (ADR 0003): the app root and the lazy start page.
// The start page carries the onboarding forms: its chunk loads with its route (#451, DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";

export { App } from "./app/app";
export const StartPage = lazyPage(() =>
  import("./start-page/start-page").then((m) => ({ default: m.StartPage })),
);
export const UnlockPage = lazyPage(() =>
  import("./unlock/unlock-page/unlock-page").then((m) => ({ default: m.UnlockPage })),
);
/** The overview "Was die App kann" (US-ONB-06) is its own chunk: it loads when "Konto" shows it (DS-08). */
export const FunctionOverview = lazyPage(() => import("./function-overview/function-overview"));
/** `LockedRows` also serves the locked parts inside a destination (US-ONB-05); the routes wire it into the areas. */
export { useUnlocks, isShownLocked, LockedRows } from "./unlock";
/** The calm hint of other views (US-ONB-07) is its own chunk: it loads only when an occasion applies (DS-08). */
export const ContextHint = lazyPage(() =>
  import("./start-page/hint/context-hint/context-hint").then((m) => ({ default: m.ContextHint })),
);
