import type { PhasesRow } from "@pflanzendex/core";

/**
 * Called with the specimens to switch and the text to show afterwards; without it the list only shows. `before` is given by
 * the bulk move: the rows as they stood before it, so its undo can take each plant back (US-QS-32).
 */
export type Confirm = (
  specimenIds: readonly string[],
  success: string,
  before?: readonly PhasesRow[],
) => void;
