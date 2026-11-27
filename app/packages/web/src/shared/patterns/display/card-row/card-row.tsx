import { Children, isValidElement, type ReactNode } from "react";

/**
 * A row of cards as a sideways shelf (US-QS-15, SG-LIST-01, owner decision 2026-11-21, issue 2412; DS-61, DS-63): the cards
 * stand side by side, each one narrower than the shelf by the peek, so the next card shows at the edge and tells that there
 * is more; a swipe or the arrow keys scroll it and each card snaps to the start of the shelf. It is the marked sideways region
 * `cards` of the one-screen gate (`data-scroll-x`), and the one place where a card scrolls sideways: a card itself never
 * scrolls (the deck never scrolls, US-QS-32). The shelf is a tab stop (WCAG 2.1.1, axe scrollable-region-focusable) and is
 * named for the screen reader; a focus inside a card scrolls that card into view by itself. The cards are the items of one
 * list, so the count is read. The peek is 3 rem less a gap of 0.75 rem, 36 px at the normal text size (starting value,
 * assumption: between 8 px and 40 % of the shelf); a card is at most 24 rem wide, so on a wide shelf the next card still
 * peeks in. `overscroll-y-auto` hands a vertical swipe on the shelf to the sheet around it.
 */
export function CardRow(props: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={props.label}
      data-scroll-x="cards"
      tabIndex={0}
      className="min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-contain overscroll-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <ul className="m-0 flex list-none gap-3 p-0">
        {Children.toArray(props.children).map((child, index) => (
          <li
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="w-[min(calc(100%-3rem),24rem)] min-w-0 shrink-0 snap-start"
          >
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
