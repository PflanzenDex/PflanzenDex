import { texts } from "@/shared/lib/text-rules/texts";
import table from "./sheet.de.json";

const t = texts(table);

/**
 * The heights of a bottom sheet (US-QS-15, owner decision 4 of 2026-11-21, issue 2412; owner answers 2026-11-21, issue 2415).
 * The maths of them is pure, so it is tested without a browser: which heights a sheet has, where a drag ends and what an
 * announcement says. The component side is `use-sheet-height.ts`.
 *
 * - `fit`: the content, with its header, fits within half the visible window: the sheet is as high as its content.
 * - `two`: the content is longer: the sheet has half height and full height; it opens at half.
 * - `full`: the content is longer and title and actions do not fit within half (200 % text, an open keyboard): full height only.
 */
export type SheetKind = "fit" | "two" | "full";
export type Detent = "half" | "full";
export type Heights = { half: number; full: number };

/** Half height is this share of the visible window height (US-QS-15). */
const HALF_SHARE = 0.5;
/**
 * A drag that ends lower than this share of the lowest height below it closes the sheet (starting value, assumption: the
 * 25 % that Vaul used for the drag of the whole sheet before the heights). A shorter drag brings the sheet back.
 */
const CLOSE_SHARE = 0.25;
/**
 * The body of a sheet shows at least this many root font sizes at half height (4 rem of content between the 2 rem of its
 * padding), else title and actions fill the half and the sheet opens at full height (starting value, assumption).
 */
const MIN_BODY_REM = 6;
/** A content that is this many pixels longer than the sheet still counts as fitting: layout rounds to whole pixels. */
const TOLERANCE = 1;

/** The half and the full height in px for a window `visible` px high, of which the top `top` px lie under the status bar. */
export function sheetHeights(visible: number, top: number): Heights {
  return { half: Math.round(visible * HALF_SHARE), full: Math.max(visible - top, 0) };
}

/** What the sheet shows of itself, in px, at one moment (`use-sheet-measure.ts` reads it from the page). */
export type Measure = {
  /** The height of the sheet now. */
  height: number;
  /** How far the regions that the sheet bounds (its body, the region of a layer) overflow: what scrolls inside. */
  overflow: number;
  /** What stays in place of the sheet: the header (handle, title row with its bar, description) and the actions below the content. */
  chrome: number;
  /** The root font size, so a larger text size grows the minimum of the body with it. */
  rem: number;
};

/**
 * Which heights the sheet has. The content is as long as the sheet and what scrolls inside it; without overflow it is at
 * most as long as the sheet, so a sheet at half height with no overflow is a fitting sheet, and a sheet at full height
 * stays a sheet with two heights: its content cannot be told from the empty room below it. A sheet that asks for half
 * height at least (`atLeastHalf`, owner decision 2026-11-22, issue 2424: a list of unknown length such as the news) has two heights also while
 * its content is short, so it does not grow from a small sheet to half height while its list loads; at 200 % text, when title
 * and actions fill half, it opens at full height as any other.
 */
export function sheetKind(m: Measure, heights: Heights, atLeastHalf = false): SheetKind {
  const natural = m.overflow > TOLERANCE ? m.height + m.overflow : m.height;
  if (natural <= heights.half + TOLERANCE && !atLeastHalf) return "fit";
  return m.chrome + MIN_BODY_REM * m.rem > heights.half ? "full" : "two";
}

/** The nearer of half and full height; the middle between them goes to full height. */
export function nearestDetent(height: number, heights: Heights): Detent {
  return height - heights.half < heights.full - height ? "half" : "full";
}

/** The heights a drag moves between: the lowest one the sheet keeps, and the highest one it grows to. */
export type DragBounds = { lowest: number; highest: number };

/** One frame of a drag: the sheet's height, and how far the whole sheet has slid down below its lowest height. */
export type DragFrame = { height: number; offset: number };

/**
 * One frame of a drag on the handle. `raw` is the height the finger asks for (the height at the start less the way it
 * went down). Between the lowest and the highest height only the height changes; below the lowest the sheet keeps it and
 * slides down, as a sheet does that is about to close.
 */
export function dragFrame(raw: number, bounds: DragBounds): DragFrame {
  if (raw >= bounds.lowest) return { height: Math.min(raw, bounds.highest), offset: 0 };
  return { height: bounds.lowest, offset: bounds.lowest - raw };
}

/** What a release does: close the sheet, or snap a sheet with two heights to one of them (`null`: no change of height). */
export type Release = { close: boolean; detent: Detent | null };

export function releaseOf(
  frame: DragFrame,
  heights: Heights,
  kind: SheetKind,
  lowest: number,
): Release {
  if (frame.offset > lowest * CLOSE_SHARE) return { close: true, detent: null };
  return { close: false, detent: kind === "two" ? nearestDetent(frame.height, heights) : null };
}

/** The text a screen reader hears after a change of height: the sheet's title and the new height ("Details, Vollbild"). */
export function announcement(title: string, detent: Detent): string {
  return t("sheet.announce", { title, height: t(detent === "full" ? "sheet.full" : "sheet.half") });
}
