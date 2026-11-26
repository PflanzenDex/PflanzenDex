import type { Ref } from "react";

/**
 * The bar of a dialog and of a pane (US-QS-32, SG-SHEET-04, owner decision d-115): an element under the scroll region of the
 * layer, outside it, so the pair that a `FormBar` draws into it never scrolls away and the confirming action is always in
 * view, as in a phone sheet. The empty element takes no room (`empty:hidden`), so a layer without a form shows no bar. The
 * container hands the element to its host (`useModalBarHost`, `usePinnedBarHost`); the border and the gap set the bar off from
 * the fields above it.
 */
export function PinnedBar(props: { slotRef: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={props.slotRef}
      data-layer-bar=""
      className="flex shrink-0 flex-col gap-1 border-t border-border pt-3 empty:hidden"
    />
  );
}
