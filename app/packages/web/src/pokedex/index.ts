// Public interface of the module `pokedex` (ADR 0003): page with the caught species (US-POK-06).
import { lazyPage } from "@/components/shared/lazy-page";
export const PokedexPage = lazyPage(() =>
  import("./PokedexPage").then((m) => ({ default: m.PokedexPage })),
);
