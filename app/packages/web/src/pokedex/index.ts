// Public interface of the module `pokedex` (ADR 0003): page with the caught species (US-POK-06).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const PokedexPage = lazyPage(() =>
  import("./pokedex-page/pokedex-page").then((m) => ({ default: m.PokedexPage })),
);
