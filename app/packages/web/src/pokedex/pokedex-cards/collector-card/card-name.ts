import type { CollectorCard as Card } from "@pflanzendex/core";
import { germanNameOf } from "@/shared/species-name/species-name";

/** The name that titles a collector card and its details: the German name where the catalog has one, else the scientific name (SG-TYPE-08). */
export const cardName = (c: Pick<Card, "species" | "germanName">): string =>
  germanNameOf(c.species, c.germanName) ?? c.species;
