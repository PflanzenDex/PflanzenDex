import * as React from "react";
import { sheetKind, type Heights, type SheetKind } from "./sheet.detents";

const rootRem = (): number => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** The regions that the height of the sheet bounds: its body, and the scroll region of a layer's body (`LayerBody`). */
const BOUNDED = "[data-sheet-body], [data-layer-body] > [data-scroll-region]";

/** How far the regions that the sheet bounds overflow: what the sheet leaves them is short of their content by this. */
function overflowOf(sheet: HTMLElement): number {
  let total = 0;
  sheet.querySelectorAll<HTMLElement>(BOUNDED).forEach((region) => {
    total += Math.max(0, region.scrollHeight - region.clientHeight);
  });
  return total;
}

/**
 * What the content leaves in place below its scroll region: the primary action of a layer (`data-sheet-pinned`, `LayerBody`),
 * with the gap of one root font size between them (US-QS-15: title and actions stay, so they count for the half height).
 */
function pinnedOf(sheet: HTMLElement, rem: number): number {
  let total = 0;
  sheet.querySelectorAll<HTMLElement>("[data-sheet-pinned]").forEach((pinned) => {
    total += pinned.offsetHeight + rem;
  });
  return total;
}

/** The parts of an open sheet whose size says how high its content is. */
type Parts = { sheet: HTMLElement | null; header: HTMLElement | null; body: HTMLElement | null };

/**
 * Which heights the sheet has (`sheetKind`), read from the page (US-QS-15): it is measured when the sheet opens, when
 * the window changes (a rotation, the keyboard, a larger text size) and whenever the sheet, its header or what its body
 * holds changes size or content, one frame later so a burst of changes is one measurement.
 */
export function useSheetKind(
  parts: Parts,
  heights: Heights,
  open: boolean,
  atLeastHalf = false,
): SheetKind {
  const [kind, setKind] = React.useState<SheetKind>("fit");
  const { sheet, header, body } = parts;
  React.useLayoutEffect(() => {
    if (!open || !sheet || !header || !body) return;
    const measure = () => {
      const rem = rootRem();
      setKind(
        sheetKind(
          {
            height: sheet.offsetHeight,
            overflow: overflowOf(sheet),
            chrome: header.offsetHeight + pinnedOf(sheet, rem),
            rem,
          },
          heights,
          atLeastHalf,
        ),
      );
    };
    measure();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
    [sheet, header, body].forEach((element) => resize?.observe(element));
    const mutation = new MutationObserver(later);
    mutation.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    // A picture that has loaded changes the height of what is around it without a change of the page's own nodes.
    body.addEventListener("load", later, true);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      body.removeEventListener("load", later, true);
    };
  }, [open, sheet, header, body, heights, atLeastHalf]);
  return kind;
}
