/** German texts of the bulk sharing in the layer "Was Freunde sehen"; `{done}`, `{total}` and `{rest}` are filled in by `partialText` (P-10). */
export const SHARING_TEXTS = {
  partial: "{done} von {total} Arten geändert, {rest} nicht.",
} as const;

/** How far a refused bulk action got: the species changed, the species of all, and the ones left unchanged. */
export function partialText(done: number, total: number): string {
  return SHARING_TEXTS.partial
    .replace("{done}", String(done))
    .replace("{total}", String(total))
    .replace("{rest}", String(total - done));
}
