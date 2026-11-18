/** Called with the specimens to switch and the text to show afterwards; without it the list only shows. */
export type Confirm = (specimenIds: readonly string[], success: string) => void;
