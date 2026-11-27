// The classes of the flat groups of rows (US-QS-32, SG-SHAPE-03, FX-35, FX-06): one rounded group on the card colour with no
// shadow and no group inside a group (SG-SHAPE-06). The group keeps its boundary in forced colors.
//
// A group of a scrolling list (`ScrollEntries`, `flex-1` in fit mode) is a transparent list that stretches to
// the height the frame leaves: the card and the rounded corners move onto its rows. The first row is rounded at the top, the last
// one at the bottom, and a hairline separates two rows. A short list ends after its last row; the list itself stays as tall as
// the page allows, so the list still takes the room it has (issue 1413).

export const GROUP =
  "m-0 flex list-none flex-col overflow-hidden rounded-card border border-transparent bg-card p-0 text-card-foreground forced-colors:border-[CanvasText]";

/** The HAIRLINE between two rows of a group, from the text's left edge to the right edge (SG-SHAPE-07). */
export const HAIRLINE =
  "relative before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden";

/** The scrolling list: transparent, no gap, and no `flex-none`, so the `flex-1` of a fitting list stays (issue 1413). */
const ENTRY_LIST = "m-0 flex list-none flex-col gap-0 p-0 text-card-foreground";

/**
 * The rows of a scrolling list carry the group's look: each row is a card-coloured piece that clips its hover colour to the
 * corners; the first row is rounded at the top, the last at the bottom. The forced-colors boundary runs left and right on
 * every row, and at the top of the first and the bottom of the last, so the group keeps its edge.
 */
const ROWS_OF_GROUP =
  "[&>li]:relative [&>li]:overflow-hidden [&>li]:bg-card [&>li]:text-card-foreground [&>li]:border-x [&>li]:border-transparent [&>li]:forced-colors:border-x-[CanvasText] [&>li:first-child]:rounded-t-card [&>li:first-child]:border-t [&>li:first-child]:forced-colors:border-t-[CanvasText] [&>li:last-child]:rounded-b-card [&>li:last-child]:border-b [&>li:last-child]:forced-colors:border-b-[CanvasText]";

/**
 * The hairline between two rows of a scrolling list: the before pseudo-element of every row after the first, across the classes
 * `inset` names (its left and right, or its inset). The child selectors draw it on the rows the list holds, so a list needs no
 * class per row.
 */
function hairlineOnRows(inset: readonly string[]): string {
  const sides = inset.map((c) => `[&>li+li]:before:${c}`).join(" ");
  return `[&>li+li]:before:absolute ${sides} [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border [&>li+li]:before:content-['']`;
}

/** The hairline of object rows starts after the 56 px thumbnail (8 + 56 + 8 px), so the title lines up with it. */
const OBJECT_HAIRLINE = hairlineOnRows(["left-[72px]", "right-2"]);

/** The hairline of settings and task rows starts at the text's left edge, 16 px (SG-SHAPE-07). */
const ROW_HAIRLINE = hairlineOnRows(["inset-x-4"]);

/** One group of object rows (SG-LIST-03): a plant list with the card on its rows and a hairline between them. */
export const OBJECT_GROUP = `${ENTRY_LIST} ${ROWS_OF_GROUP} ${OBJECT_HAIRLINE}`;

/**
 * One group of navigating or acting rows in a scrolling list (a task list, a list of zones or locations; FX-06, SG-SHAPE-03). Its rows
 * are `GroupedRow`s with `bare`, because the list wraps each one.
 */
export const ROW_GROUP = `${ENTRY_LIST} ${ROWS_OF_GROUP} ${ROW_HAIRLINE}`;

/**
 * The wrap of a row with an action beside its text (US-QS-32, issue 2322, SG-LIST-03): the row wraps when the text and the
 * action do not fit beside each other, and the action then moves below the text on a line of its own. The text part keeps at
 * least its basis, given in rem so it grows with the text size: a name keeps two lines beside the action.
 */
/** The text part of an object row: the 56 px thumbnail and two lines of name (starting value, tuned by measurement). */
export const OBJECT_TEXT = "grow basis-[calc(56px_+_8rem)]";
/** The text part of a treatment row: about two lines of its name (starting value, tuned by measurement). */
export const TREATMENT_TEXT = "grow basis-36";
/** The heading of a group with an action beside it: it keeps at least 8 rem, in rem so it grows with the text size (issue 2524). */
export const HEADING_TEXT = "grow basis-32";
/** An action beside a row: it keeps its size and sits at the trailing edge of its own line when the row wraps. */
export const ROW_ACTION = "ml-auto max-w-full shrink-0";
