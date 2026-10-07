import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-label` (13 px, tokens.css) is a font size; without this twMerge reads it as a colour and drops it next to `text-primary`.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["label"] }] } },
});

/** Merges class names; conflicting Tailwind classes resolve to the last one, so caller classes win (DS-31). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
