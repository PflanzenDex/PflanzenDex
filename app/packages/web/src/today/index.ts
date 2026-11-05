// Public interface of the module `today` (ADR 0003): the central "Today" list (TE-07).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export type { TodayDestination } from "./today-page/today-page";
export const TodayPage = lazyPage(() =>
  import("./today-page/today-page").then((m) => ({ default: m.TodayPage })),
);
// The texts of the tiles of "Heute", drawn by the area of the app (FR-QG-26, issue 1156).
export { default as todayTexts } from "./today.de.json";
