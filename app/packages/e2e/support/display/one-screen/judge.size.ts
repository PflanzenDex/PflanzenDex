// The minimum sizes of the one-screen gate (P-S, issue 2431, US-QS-15, QG-U8): a picture, a text box, a list row or a name
// that shrinks below its floor fails, even when nothing overflows (#2383: a 53x40 card picture; #2315: rows of 1 to 2 px).
// Starting values, assumptions (owner decision 2026-11-23, d-105): a change here is a gate change (US-QG-07).
import type { Found, Size, Sized } from "./judge.types";

/** Card picture: 4:3 within 2 % and at least 120 px wide (SG-PHOTO-01, US-QS-32). */
export const PICTURE_RATIO = 4 / 3;
export const PICTURE_RATIO_TOLERANCE = 0.02;
export const PICTURE_MIN_WIDTH_PX = 120;
/** A visible text box is at least one line high, less 1 px of rounding. */
export const TEXT_LINE_TOLERANCE_PX = 1;
/** A list row is at least 36 px high, also at 200 % text. */
export const ROW_MIN_HEIGHT_PX = 36;
/** A name in a row or card is at least 96 px wide. */
export const NAME_MIN_WIDTH_PX = 96;

const px = (n: number) => `${Math.round(n)} px`;

/** The floors one measurement breaks, as rule `size`. Pure. */
export function sizeFound(sized: Sized | undefined, size: Size): Found[] {
  if (!sized || size.kind === "cap") return [];
  const found: Found[] = [];
  for (const p of sized.pictures) {
    const ratio = p.height > 0 ? p.width / p.height : 0;
    const off = Math.abs(ratio / PICTURE_RATIO - 1);
    if (off > PICTURE_RATIO_TOLERANCE || p.width < PICTURE_MIN_WIDTH_PX)
      found.push([
        "size",
        `size: picture ${p.el} is ${px(p.width)} x ${px(p.height)} (needs 4:3 within ${PICTURE_RATIO_TOLERANCE * 100} % and at least ${PICTURE_MIN_WIDTH_PX} px wide)`,
      ]);
  }
  for (const t of sized.texts)
    if (t.height < t.lineHeight - TEXT_LINE_TOLERANCE_PX)
      found.push([
        "size",
        `size: text ${t.el} is ${px(t.height)} high, under one line of ${px(t.lineHeight)}`,
      ]);
  for (const r of sized.rows)
    if (r.height < ROW_MIN_HEIGHT_PX)
      found.push([
        "size",
        `size: row ${r.el} is ${px(r.height)} high (at least ${ROW_MIN_HEIGHT_PX} px)`,
      ]);
  for (const n of sized.names)
    if (n.width < NAME_MIN_WIDTH_PX)
      found.push([
        "size",
        `size: name ${n.el} is ${px(n.width)} wide (at least ${NAME_MIN_WIDTH_PX} px)`,
      ]);
  return found;
}
