// Public interface of the module `today` (ADR 0003): the central "Today" list (TE-07).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export type { TodayDestination } from "./today-page/today-page";
export const TodayPage = lazyPage(() =>
  import("./today-page/today-page").then((m) => ({ default: m.TodayPage })),
);
// The skeleton of "Heute" in the shape of its page, the route's fallback and the area's parts (US-QS-14, issue 1697).
export { TodaySkeleton } from "./today-page/today-skeleton/today-skeleton";
// The body of that skeleton alone: the start frame draws it while the shell loads (issue 2230).
export { TodaySkeletonBody } from "./today-page/today-skeleton/today-skeleton-body/today-skeleton-body";
// The query key of the central list: the area reloads it when a write changes what it derives from (SG-FEED-01).
export { TODAY_LIST_KEY } from "./today-api";
