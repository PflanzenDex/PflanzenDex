import { WISH_LIMITS } from "@pflanzendex/core";
import type { WishInput } from "./wishlist-api";

export interface WishFields {
  name: string;
  german: string;
  targetZoneId: string;
  difficulty: string;
  reasoning: string;
  imageUrl: string;
  imageSource: string;
}

export const EMPTY_FIELDS: WishFields = {
  name: "",
  german: "",
  targetZoneId: "",
  difficulty: "",
  reasoning: "",
  imageUrl: "",
  imageSource: "",
};

/** Turns the form into the input of the API, or says in German what is missing (FR-WUN-01, FR-WUN-04). Empty stays unknown (P-08). */
export function checkWish(f: WishFields): { input: WishInput } | { problem: string } {
  const name = f.name.trim();
  if (name.length < WISH_LIMITS.name.min) return { problem: "Bitte gib einen Namen an." };
  const imageUrl = f.imageUrl.trim();
  const imageSource = f.imageSource.trim();
  if ((imageUrl === "") !== (imageSource === ""))
    return {
      problem: "Ein Bild gehört mit seiner Quelle zusammen: Gib beides an oder keins von beiden.",
    };
  if (imageUrl !== "" && !imageUrl.toLowerCase().startsWith("https://"))
    return { problem: "Die Bild-Adresse muss mit https:// beginnen." };
  const german = f.german.trim();
  const reasoning = f.reasoning.trim();
  return {
    input: {
      name,
      ...(german ? { german } : {}),
      ...(f.targetZoneId ? { targetZoneId: f.targetZoneId } : {}),
      ...(f.difficulty ? { difficulty: Number(f.difficulty) } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(imageUrl ? { imageUrl, imageSource } : {}),
    },
  };
}
