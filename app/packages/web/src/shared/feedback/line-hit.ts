/**
 * The margin of a button that sits on one line of text and keeps its 44 px hit area (SG-FEED-05, issue 2466): the button is
 * 44 px high, the line is `1lh`, so half the difference hangs over the line on each side. In `lh`, not in `rem`: at 200 %
 * text the line is 40 px, a `-my-3` of 24 px would make the margin box of the button negative, and a wrapped row would lose
 * its height and let the next row run under the button.
 */
export const LINE_HIT = "-my-[calc((44px-1lh)/2)]";
