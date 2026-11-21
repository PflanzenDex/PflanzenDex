/**
 * The class of the decision row, from the text size the deck read once (US-QS-14, US-QS-32). At the normal size it sticks in a
 * tall window; at large text it is not sticky and follows the card in the flow, so it never covers the card (SG-TYPE-04).
 */
export function decisionRowClass(large: boolean): string {
  return large
    ? "z-10 border-t border-border bg-background py-2 tall-window:mb-20 tall-window:md:mb-0"
    : "z-10 border-t border-border bg-background py-2 tall-window:sticky tall-window:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] tall-window:md:bottom-0";
}
