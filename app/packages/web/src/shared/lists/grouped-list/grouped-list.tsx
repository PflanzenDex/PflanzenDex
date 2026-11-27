import { useId, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { cn } from "@/shared/lib/utils";
import { RowContent, RowElement } from "./row-parts/row-parts";
import { GROUP, HAIRLINE, HEADING_TEXT, ROW_ACTION } from "./group-classes";

// The flat grouped list of the phone look (US-QS-32, SG-SHAPE-03): one rounded group on the page colour, rows separated
// by a hairline that starts at the text, no shadow (SG-SHAPE-05) and no group inside a group (SG-SHAPE-06). The group
// keeps its boundary in forced colors. The space between groups (24 px, SG-SHAPE-07) is the caller's.
// A long name breaks at a syllable with a hyphen where it is wider than the row, as at 200 % text (DS-63), and never runs sideways.
const LABEL = "text-base font-semibold text-foreground hyphens-auto [overflow-wrap:anywhere]";
const FOOTER = "text-sm text-muted-foreground";

/** A row's own box: at least 44 px high, 12 px above and below, 16 px at the sides (SG-SHAPE-07, SG-TOUCH-01). */
const ROW =
  "flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3 text-left text-base text-foreground";
/**
 * An object row (a plant, a species, a wish; SG-LIST-03): its sides and gaps are 8 px (rem steps, so they grow with the text),
 * which leaves the title the width it needs at 200 % text (US-QS-32). The row wraps: when the name keeps less than 96 px beside the
 * trailing element (a badge at 200 % text in a layer), the trailing element moves below the name (US-QS-15, QG-U8).
 */
const OBJECT_ROW = "flex-wrap gap-2 px-2 py-2.5";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const INTERACTIVE = `hover:bg-muted hover:text-foreground ${FOCUS}`;

/**
 * The heading of a group that stays at the top of its scroll region while the group passes (SG-LIST-06): an opaque surface, so
 * the rows do not show through, and a rest position under the next group's heading (a sticky element stays inside its own
 * section, so the next heading pushes it out). `group-data-[sticky=off]/sections` is the region's own switch: a heading that
 * would cover more than a third of the region (a long name at 200 % text) stays in the flow (`useStickyFit`).
 */
const STICKY = "sticky top-0 z-10 py-1 group-data-[sticky=off]/sections:static";
const SURFACE = { page: "bg-background", layer: "bg-card" } as const;

export type GroupedListProps = {
  /** The name of the section; the section is labelled by it. Without a label the group has no name (the sign-out row). */
  label?: ReactNode;
  /** The heading level of the label: 2 below the page's one h1 (SG-HEAD-03), 3 or 4 inside a layer. */
  level?: 2 | 3 | 4;
  /** A quiet line under the group (14 px, muted), for example what the group does not show. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * The label stays at the top of the scroll region while its group passes (SG-LIST-06): `page` on the page's surface, `layer`
   * on the surface of a sheet, a dialog or a pane.
   */
  sticky?: keyof typeof SURFACE;
  /**
   * One plain action beside the label, for example "Standort setzen" of the group whose value is unknown (SG-LIST-06). Where
   * the label would keep less than 8 rem (200 % text), the action moves below it, as in an object row (issues 2524, 2322).
   */
  action?: ReactNode;
  /** The caller brings the group's list (a `ScrollEntries`, an empty line): the children are not wrapped in a group `ul`. */
  free?: boolean;
  /** The key a jump finds the section by (`data-group-key`, the chips of `GroupSections`). */
  groupKey?: string;
  ref?: Ref<HTMLElement>;
};

/**
 * A section of flat grouped rows (SG-SHAPE-03, SG-LIST-06): an optional label above one `ul` group and an optional
 * footer under it. Its rows are `GroupedRow`s. The label is a real heading, so the section can be reached by heading. A
 * section of a long grouped list has a `sticky` label and may bring its own list (`free`).
 */
export function GroupedList(props: GroupedListProps) {
  const id = useId();
  const Heading = `h${props.level ?? 2}` as "h2" | "h3" | "h4";
  const head =
    props.label === undefined ? null : props.sticky === undefined && props.action === undefined ? (
      <Heading id={id} className={LABEL}>
        {props.label}
      </Heading>
    ) : (
      <div
        data-group-heading=""
        className={cn(
          "flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1",
          props.sticky && STICKY,
          props.sticky && SURFACE[props.sticky],
        )}
      >
        <Heading
          id={id}
          className={cn(LABEL, "min-w-0", props.action !== undefined && HEADING_TEXT)}
        >
          {props.label}
        </Heading>
        {props.action !== undefined && <div className={ROW_ACTION}>{props.action}</div>}
      </div>
    );
  return (
    <section
      ref={props.ref}
      aria-labelledby={props.label === undefined ? undefined : id}
      {...(props.groupKey === undefined ? {} : { "data-group-key": props.groupKey })}
      className={cn("flex min-w-0 flex-col gap-2", props.className)}
    >
      {head}
      {props.free ? props.children : <ul className={GROUP}>{props.children}</ul>}
      {props.footer !== undefined && <p className={FOOTER}>{props.footer}</p>}
    </section>
  );
}

export type GroupedRowProps = {
  id?: string | undefined;
  /** Navigates: the row is a link to this address. Wins over `onClick` when both are given. */
  to?: string | undefined;
  /** Acts: the row is a button. */
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  /** Opens a layer: the button says so (`aria-haspopup`) and whether the layer is open (`aria-expanded`). */
  haspopup?: "dialog" | undefined;
  expanded?: boolean | undefined;
  /** The row of the open section: `aria-current="page"` and a semibold title, not colour alone (SG-COLOR-05). */
  current?: boolean | undefined;
  /**
   * `destructive` is a red action for a destructive step (SG-COLOR-04); it has no chevron. `warning` is the amber row of the
   * most urgent item of "Heute" (US-QS-18): the warning tokens, and no hover fill that would hide them.
   */
  tone?: "default" | "destructive" | "warning" | undefined;
  /**
   * `object` is a row of an object (a plant, a species, a wish; SG-LIST-03): the name wraps to two lines and clamps, the
   * meta line wraps to further lines and is never cut, and a link or button is named by its visible content in its visible
   * order (the title, then the meta and the trailing element). `list` (the default) is a settings row.
   */
  variant?: "list" | "object" | undefined;
  /**
   * The row is no list item of its own: the host already wraps it in one (the list of `ScrollEntries` does). Without it the row
   * is an `li` of its `GroupedList`.
   */
  bare?: boolean | undefined;
  /**
   * 8 px above and below instead of 12 px, for the rows of a list that has to show two whole rows on the first screen of a
   * 360 x 640 phone (SG-LIST-01, issue 1854). The row keeps its 44 px hit area and its text size.
   */
  dense?: boolean | undefined;
  /**
   * An action stands beside the row (`ObjectRow` draws it, because a button cannot sit in a link or a button). The action is
   * the row's one trailing element, so the chevron steps aside (SG-LIST-03). It is no way to hide the chevron of an opener
   * that has nothing beside it (issue 2355).
   */
  hasAction?: boolean | undefined;
  /** A picture or an icon at the leading edge. */
  leading?: ReactNode;
  /** The row's name: 16 px, wraps and is never cut (SG-TYPE-05). */
  title: ReactNode;
  /** One line under the title, 14 px muted (SG-TYPE-02). */
  meta?: ReactNode | undefined;
  /** A value (16 px, tabular) or another trailing element; neutral, never green (SG-COLOR-02). */
  trailing?: ReactNode;
};

/**
 * One row of a `GroupedList`: a link, a button or plain content. Every row that opens a view (a link) or a layer (a button)
 * shows the neutral chevron at the trailing edge, after its value, unless it is destructive or has a trailing element of
 * its own (a trailing element or an action beside an object row, SG-LIST-03: at most one). Plain content never shows one. A caller cannot
 * suppress it (SG-TOUCH-02, issue 2355).
 */
export function GroupedRow(props: GroupedRowProps) {
  const destructive = props.tone === "destructive";
  const warning = props.tone === "warning";
  const interactive = props.to !== undefined || props.onClick !== undefined;
  const object = props.variant === "object";
  const hasOwnTrailing = (object && props.trailing !== undefined) || props.hasAction === true;
  const chevron = interactive && !destructive && !hasOwnTrailing;
  const look = cn(
    ROW,
    object && OBJECT_ROW,
    props.dense && "py-2",
    interactive && (warning ? FOCUS : INTERACTIVE),
    props.current && "bg-muted",
    destructive && "text-destructive",
    warning && "bg-warning text-warning-foreground",
  );
  const body = (
    <RowElement
      id={props.id}
      to={props.to}
      onClick={props.onClick}
      haspopup={props.haspopup}
      expanded={props.expanded}
      current={props.current}
      look={look}
    >
      <RowContent
        leading={props.leading}
        title={props.title}
        meta={props.meta}
        trailing={props.trailing}
        current={props.current === true}
        destructive={destructive}
        warning={warning}
        chevron={chevron}
        object={object}
      />
    </RowElement>
  );
  return props.bare ? body : <li className={HAIRLINE}>{body}</li>;
}
