// Public interface of the flows (FR-QG-23 step 3, formerly the `shell` folder): the onboarding parts of "Heute" and the unlock page.
// The onboarding forms are their own chunks: they load only when they apply (#451, DS-08, QG-U6).
// The app root is not here: the entry imports it from its frame, so the start chunk does not carry these lazy parts (issue 2242).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";

export const TodayIntro = lazyPage(() =>
  import("./onboarding/today-intro/today-intro").then((m) => ({ default: m.TodayIntro })),
);
export const UnlockPage = lazyPage(() =>
  import("./unlock/unlock-page/unlock-page").then((m) => ({ default: m.UnlockPage })),
);
/** The overview "Was die App kann" (US-ONB-06) is its own chunk: it loads when "Konto" shows it (DS-08). */
export const FunctionOverview = lazyPage(
  () => import("./onboarding/function-overview/function-overview"),
);
/** The calm hint of other views (US-ONB-07) is its own chunk: it loads only when an occasion applies (DS-08). */
export const ContextHint = lazyPage(() =>
  import("./onboarding/today-intro/hint/context-hint/context-hint").then((m) => ({
    default: m.ContextHint,
  })),
);
/** The quick flow for a further plant (US-ONB-01) is its own chunk: it loads at its address (DS-08). */
export const AddPlant = lazyPage(() =>
  import("./add-plant/add-plant").then((m) => ({ default: m.AddPlant })),
);
