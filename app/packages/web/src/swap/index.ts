// Public interface of the `swap` module (ADR 0012): the exchange page and the match deck. It loads with its route (DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const ExchangePage = lazyPage(() =>
  import("./pages/exchange/exchange").then((m) => ({ default: m.ExchangePage })),
);
export const MatchPage = lazyPage(() =>
  import("./pages/match/match").then((m) => ({ default: m.MatchPage })),
);
