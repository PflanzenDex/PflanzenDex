/**
 * The class of the decision row, from the text size the deck follows (US-QS-14, US-QS-32). At the normal size it sticks in a
 * tall window, at the bottom of the frame of the deck (`bottom-0`: the fit-screen frame already ends above the phone bar, so
 * the offset of the bar pushed the row up over the card, issue 2421); at large text it is not sticky and follows the card in
 * the flow, so it never covers the card (SG-TYPE-04).
 */
export function decisionRowClass(large: boolean): string {
  return large
    ? "z-10 border-t border-border bg-background py-2 tall-window:mb-20 tall-window:md:mb-0"
    : "z-10 border-t border-border bg-background py-2 tall-window:sticky tall-window:bottom-0";
}
