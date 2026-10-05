import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names; conflicting Tailwind classes resolve to the last one, so caller classes win (DS-31). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
