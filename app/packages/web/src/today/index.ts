// Public interface of the module `today` (ADR 0003): the central "Today" list (TE-07).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export type { TodayDestination } from "./today-page/today-page";
export const TodayPage = lazyPage(() =>
  import("./today-page/today-page").then((m) => ({ default: m.TodayPage })),
);
