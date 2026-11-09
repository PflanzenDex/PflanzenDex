// Public interface of the module `pokedex` (ADR 0003): page with the caught species (US-POK-06), and the parts of the
// collector cards that other modules show (the difficulty stars and the Wikipedia source of a suggestion card, US-ENT-01).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const PokedexPage = lazyPage(() =>
  import("./pokedex-page/pokedex-page").then((m) => ({ default: m.PokedexPage })),
);
export { DifficultyStars, WikipediaSource } from "./pokedex-cards/collector-card/collector-card";
// The skeleton of the species mode, the mode's skeleton on "Sammlung" (US-QS-14, issue 1727).
export { PokedexPageSkeleton } from "./pokedex-page/pokedex-page.skeleton";
