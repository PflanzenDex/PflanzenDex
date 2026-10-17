// Public interface of the `swap` module (ADR 0012): the exchange page. It loads with its route (DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const ExchangePage = lazyPage(() =>
  import("./pages/exchange/exchange").then((m) => ({ default: m.ExchangePage })),
);
