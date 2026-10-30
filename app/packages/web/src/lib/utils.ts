import { clsx, type ClassValue } from "clsx";
import { createTailwindMerge } from "tailwind-merge";
import { MERGE_CONFIG } from "./class-merge/merge-config";

const twMerge = createTailwindMerge(() => MERGE_CONFIG);

/** Merges class names; conflicting Tailwind classes resolve to the last one, so caller classes win (DS-31). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
