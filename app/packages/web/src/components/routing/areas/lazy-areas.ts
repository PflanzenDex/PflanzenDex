import { lazyPage } from "@/components/routing/lazy-page/lazy-page";

/** The destinations "Heute" and "Konto" with their sections are their own lazy parts: the shell does not carry them (DS-08, US-QS-14). */
export const TodayArea = lazyPage(() =>
  import("./today-area/today-area").then((m) => ({ default: m.TodayArea })),
);
export const AccountArea = lazyPage(() =>
  import("./account-area/account-area").then((m) => ({ default: m.AccountArea })),
);
