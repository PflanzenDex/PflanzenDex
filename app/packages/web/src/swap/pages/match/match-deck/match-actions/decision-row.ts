import { largeText } from "@/shared/patterns/display/card/card-picture/large-text";

/**
 * The class of the decision row. At the normal text size it sticks in a tall window (US-QS-14); at large text it is not sticky
 * and follows the card in the flow, so it never covers the card (US-QS-32, SG-TYPE-04).
 */
export function decisionRowClass(): string {
  return largeText()
    ? "z-10 border-t border-border bg-background py-2 tall-window:mb-20 tall-window:md:mb-0"
    : "z-10 border-t border-border bg-background py-2 tall-window:sticky tall-window:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] tall-window:md:bottom-0";
}
