// Public interface of the module `today` (ADR 0003): the central "Today" list (TE-07).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export type { TodayDestination } from "./TodayPage";
export const TodayPage = lazyPage(() =>
  import("./TodayPage").then((m) => ({ default: m.TodayPage })),
);
