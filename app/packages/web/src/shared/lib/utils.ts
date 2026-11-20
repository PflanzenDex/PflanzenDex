import { clsx, type ClassValue } from "clsx";
import type { Ref } from "react";
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

/**
 * One ref callback for several refs (callbacks or ref objects; an empty one is skipped). Memoize it on the caller's own ref:
 * React attaches a new callback again on every render, so a stable one is attached once (US-QS-32, SG-FORM-03).
 */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}
