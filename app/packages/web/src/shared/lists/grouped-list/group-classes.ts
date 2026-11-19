// The classes of one flat group of rows (US-QS-32, SG-SHAPE-03, FX-35): one rounded group on the card colour with no border
// of its own and no shadow (the forced-colors border keeps its boundary), and a hairline between two rows that never sits
// above the first one. A plant list or the rows of one phase is one such group (SG-LIST-06): no group inside a group.

export const GROUP =
  "m-0 flex list-none flex-col overflow-hidden rounded-card border border-transparent bg-card p-0 text-card-foreground forced-colors:border-[CanvasText]";

/** A group that is a list of its own (a pager's list): its rows touch, the hairline separates them. */
export const GROUP_LIST = `${GROUP} gap-0`;

/** The hairline between two rows of a group, from the text's left edge to the right edge. */
export const HAIRLINE =
  "relative before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden";

/**
 * The object rows of one group (a list of its own): the hairline between two rows starts at the text, after the 56 px
 * thumbnail (8 + 56 + 8 px). The child selectors draw it on the rows the list holds, so a pager needs no class per row.
 */
const OBJECT_HAIRLINE_ON_ROWS =
  "[&>li]:relative [&>li+li]:before:absolute [&>li+li]:before:left-[72px] [&>li+li]:before:right-2 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border [&>li+li]:before:content-['']";

/**
 * One group of object rows: a flat list with a hairline between its rows and none above the first. `flex-none` wins over
 * the `flex-1` of a fitting pager list, so a short list ends after its last row instead of stretching the group into an
 * empty card down to the pager.
 */
export const OBJECT_GROUP = `${GROUP_LIST} ${OBJECT_HAIRLINE_ON_ROWS} flex-none`;

/**
 * One group of rows without a thumbnail (a friend, a need, a reminder) in a pager's list (US-QS-32, SG-SHAPE-03): a flat
 * list whose rows touch, with a hairline between two rows from the inset of `GroupedList` to its other inset. The rows
 * are `GroupedRow`s with `bare`, the pager already wraps each one in its list item.
 */
export const ROW_GROUP = `${GROUP_LIST} [&>li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-4 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border [&>li+li]:before:content-['']`;
