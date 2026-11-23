import * as React from "react";
import { sheetKind, type Heights, type SheetKind } from "./detents";

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

/** What the shared Button paints as its `default` variant: the filled primary action (the one-screen gate looks for the same). */
const PRIMARY = "button.bg-primary, a.bg-primary, [role='button'].bg-primary";

/**
 * A primary action in the scrolling content that the bottom of its scroll region cuts off. An action in the bar or below the
 * region (`data-sheet-pinned`) stays in place and is never cut. A sheet at half height cannot show the end of a long form.
 */
function actionCutOf(sheet: HTMLElement): boolean {
  return Array.from(sheet.querySelectorAll<HTMLElement>(PRIMARY)).some((action) => {
    if (action.matches(":disabled, [aria-disabled='true']")) return false;
    const region = action.closest("[data-scroll-region]");
    return (
      region !== null &&
      action.getBoundingClientRect().bottom > region.getBoundingClientRect().bottom + 1
    );
  });
}

/** The parts of an open sheet whose size says how high its content is. */
type Parts = { sheet: HTMLElement | null; header: HTMLElement | null; body: HTMLElement | null };

/**
 * Which heights the sheet has (`sheetKind`), read from the page (US-QS-15): it is measured when the sheet opens, when
 * the window changes (a rotation, the keyboard, a larger text size) and whenever the sheet, its header or what its body
 * holds changes size or content, one frame later so a burst of changes is one measurement.
 */
export function useSheetKind(parts: Parts, heights: Heights, open: boolean): SheetKind {
  const [kind, setKind] = React.useState<SheetKind>("fit");
  // Once a primary action was cut at half height the sheet stays at full height, where nothing is cut: no flicker between both.
  const cut = React.useRef(false);
  const { sheet, header, body } = parts;
  React.useEffect(() => {
    if (!open) cut.current = false;
  }, [open]);
  React.useLayoutEffect(() => {
    if (!open || !sheet || !header || !body) return;
    const measure = () => {
      const rem = rootRem();
      cut.current = cut.current || actionCutOf(sheet);
      setKind(
        sheetKind(
          {
            height: sheet.offsetHeight,
            overflow: overflowOf(sheet),
            chrome: header.offsetHeight + pinnedOf(sheet, rem),
            rem,
            legacy: body.querySelector("[data-page-fit]") !== null,
            actionCut: cut.current,
          },
          heights,
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
  }, [open, sheet, header, body, heights]);
  return kind;
}
