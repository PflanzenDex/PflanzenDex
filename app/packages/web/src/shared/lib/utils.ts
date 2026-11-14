import { clsx, type ClassValue } from "clsx";
import { createTailwindMerge } from "tailwind-merge";
import { MERGE_CONFIG } from "./class-merge/merge-config";

const twMerge = createTailwindMerge(() => MERGE_CONFIG);

/** Merges class names; conflicting Tailwind classes resolve to the last one, so caller classes win (DS-31). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Look of a control while its action runs. The control is `aria-disabled`, not `disabled`: a disabled focused element loses
 * the focus to the body (SC 2.4.3). The callers ignore a second press themselves.
 */
export const BUSY_LOOK = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
