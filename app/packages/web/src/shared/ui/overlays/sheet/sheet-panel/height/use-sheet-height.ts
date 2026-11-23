import * as React from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { useScrollAccess } from "@/shared/ui/overlays/dialog/scroll-access";
import { useReducedMotion } from "@/shared/platform/device/motion/use-reduced-motion";
import { announcement, sheetHeights, type Detent, type Heights, type SheetKind } from "./detents";
import { useHandleDrag } from "./sheet-handle/use-handle-drag";
import { windowHeight } from "./use-cramped";
import { useSheetKind } from "./use-sheet-measure";
import table from "../../sheet.de.json";

const t = texts(table);

/** The part of the window that the status bar or a notch covers at the top, in px (`env(safe-area-inset-top)`, 0 where there is none). */
function safeTop(): number {
  const probe = document.createElement("div");
  probe.setAttribute(
    "style",
    "position:fixed;top:0;visibility:hidden;padding-top:env(safe-area-inset-top, 0px)",
  );
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
}

/** The visible height of the window, which the keyboard and a zoom shrink: it changes with the window and the visual viewport. */
function useWindowHeight(): number {
  const [height, setHeight] = React.useState(windowHeight);
  React.useEffect(() => {
    const read = () => setHeight(windowHeight());
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);
  return height;
}

/**
 * The height of the sheet as the two CSS variables its classes read (`h-(--sheet-height)`, `max-h-[var(--sheet-max,90dvh)]`,
 * DS-32; US-QS-15): a fitting sheet is as high as its content (`auto`) and at most half; a sheet with two heights has the
 * one it is at, or the height the finger drags it to; a sheet with full height only has that. The highest height stays the
 * limit while the height changes, so a sheet that gets lower is not cut off at once and slides. A list that pages by free
 * height keeps the classes that set its 90 % (`legacy`): without the variables the fallback of the class holds.
 */
function sheetVars(
  kind: SheetKind,
  mode: Detent,
  heights: Heights,
  dragged: number | null,
): React.CSSProperties {
  if (kind === "legacy") return {};
  const vars = (height: string, max: number) =>
    ({ "--sheet-height": height, "--sheet-max": `${max}px` }) as React.CSSProperties;
  if (kind === "fit") return vars("auto", heights.half);
  const at = kind === "full" || mode === "full" ? heights.full : heights.half;
  return vars(`${kind === "two" ? (dragged ?? at) : at}px`, heights.full);
}

type Options = {
  title: string;
  open: boolean;
  /** The sheet's element, once it is on the page. */
  sheet: HTMLElement | null;
  /** The window has no room for the full header (an open keyboard at a large text size): the sheet has no handle and no toggle. */
  cramped: boolean;
  closeRefusals: number;
  /** The sheet asks to close: a drag on the handle that ends far below half height. */
  onOpenChange: (open: boolean) => void;
};

/**
 * The heights of a bottom sheet (US-QS-15, owner decision 4 of 2026-11-21, issue 2412). The sheet opens at the height of its
 * content when that fits within half the visible window, else at half height; a longer content scrolls inside it. A sheet
 * with two heights changes between them by a drag on its handle, by the toggle and by the arrow keys of the handle, and each
 * change reaches the screen reader as a polite announcement with the sheet's title. Without motion the sheet snaps.
 * Gives the refs of the header and the body to measure, the attributes and the style of the sheet, the drag of the
 * handle, and what the keyboard has to work with: `keys` for the handle and `toggle` for its button, both only while there
 * are two heights.
 */
export function useSheetHeight(o: Options) {
  const visible = useWindowHeight();
  const heights = React.useMemo(() => sheetHeights(visible, safeTop()), [visible]);
  const [header, headerRef] = React.useState<HTMLElement | null>(null);
  const [body, bodyRef] = React.useState<HTMLElement | null>(null);
  const kind = useSheetKind({ sheet: o.sheet, header, body }, heights, o.open);
  useScrollAccess(body);
  const [mode, setMode] = React.useState<Detent>("half");
  const [dragged, setDragged] = React.useState<number | null>(null);
  const announce = useAnnounce();
  const reduced = useReducedMotion();
  // A sheet that opens again starts at its own height, and one whose close the parent refused takes its height back.
  React.useLayoutEffect(() => {
    if (o.open) {
      setMode("half");
      setDragged(null);
    }
  }, [o.open]);
  React.useLayoutEffect(() => setDragged(null), [o.closeRefusals]);
  const select = (next: Detent) => {
    if (next === mode) return;
    setMode(next);
    announce?.announce(announcement(o.title, next));
  };
  const drag = useHandleDrag({
    sheet: o.sheet,
    kind,
    heights,
    onHeight: setDragged,
    onRelease: (release) => {
      if (release.close) o.onOpenChange(false);
      else if (release.detent) select(release.detent);
    },
  });
  const adjustable = kind === "two" && !o.cramped;
  const other = mode === "full" ? "half" : "full";
  return {
    headerRef,
    bodyRef,
    drag,
    attributes: {
      "data-sheet-height": kind,
      "data-sheet-motion": reduced ? "snap" : "slide",
      style: sheetVars(kind, mode, heights, dragged),
    },
    keys: adjustable ? { mode, select } : undefined,
    toggle: adjustable
      ? {
          full: mode === "full",
          label: t(other === "full" ? "sheet.full" : "sheet.half"),
          onToggle: () => select(other),
        }
      : undefined,
  };
}
