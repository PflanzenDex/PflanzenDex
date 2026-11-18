import { useId, type MouseEventHandler, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { RowContent, RowElement, type AriaLabels, type RowIds } from "./row-parts/row-parts";

// The flat grouped list of the phone look (US-QS-32, SG-SHAPE-03): one rounded group on the page colour, rows separated
// by a hairline that starts at the text, no shadow (SG-SHAPE-05) and no group inside a group (SG-SHAPE-06). The group
// keeps its boundary in forced colors. The space between groups (24 px, SG-SHAPE-07) is the caller's.
const GROUP =
  "m-0 flex list-none flex-col overflow-hidden rounded-card border border-transparent bg-card p-0 text-card-foreground forced-colors:border-[CanvasText]";
const LABEL = "text-base font-semibold text-foreground";
const FOOTER = "text-sm text-muted-foreground";

/** A row's own box: at least 44 px high, 12 px above and below, 16 px at the sides (SG-SHAPE-07, SG-TOUCH-01). */
const ROW =
  "flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3 text-left text-base text-foreground";
/**
 * An object row (a plant, a species, a wish; SG-LIST-03): its sides and gaps are 8 px (rem steps, so they grow with the text),
 * which leaves the title the width it needs at 200 % text (US-QS-32).
 */
const OBJECT_ROW = "gap-2 px-2 py-2.5";
const INTERACTIVE =
  "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
/** The hairline between two rows: from the text's left edge to the right edge, never above the first row. */
const HAIRLINE =
  "relative before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden";

export type GroupedListProps = {
  /** The name of the section; the section is labelled by it. Without a label the group has no name (the sign-out row). */
  label?: ReactNode;
  /** The heading level of the label: 2 below the page's one h1 (SG-HEAD-03), 3 or 4 inside a layer. */
  level?: 2 | 3 | 4;
  /** A quiet line under the group (14 px, muted), for example what the group does not show. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * A section of flat grouped rows (SG-SHAPE-03, SG-LIST-06): an optional label above one `ul` group and an optional
 * footer under it. Its rows are `GroupedRow`s. The label is a real heading, so the section can be reached by heading.
 */
export function GroupedList(props: GroupedListProps) {
  const id = useId();
  const Heading = `h${props.level ?? 2}` as "h2" | "h3" | "h4";
  return (
    <section
      aria-labelledby={props.label === undefined ? undefined : id}
      className={cn("flex min-w-0 flex-col gap-2", props.className)}
    >
      {props.label !== undefined && (
        <Heading id={id} className={LABEL}>
          {props.label}
        </Heading>
      )}
      <ul className={GROUP}>{props.children}</ul>
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
  /** `destructive` is a red action for a destructive step (SG-COLOR-04); it has no chevron. */
  tone?: "default" | "destructive" | undefined;
  /**
   * `object` is a row of an object (a plant, a species, a wish; SG-LIST-03): the name wraps to two lines and clamps,
   * the meta line is one line that truncates, and a link or button is named by its title with the meta and the trailing
   * element as its description. `list` (the default) is a settings row.
   */
  variant?: "list" | "object" | undefined;
  /**
   * The row is no list item of its own: the host already wraps it in one (the list of a pager does). Without it the row
   * is an `li` of its `GroupedList`.
   */
  bare?: boolean | undefined;
  /**
   * Suppresses the chevron of a link or button row (a row that has a trailing element of its own gets none either). It
   * cannot draw one: a row without a link or a button never shows a chevron.
   */
  chevron?: boolean | undefined;
  /** A picture or an icon at the leading edge. */
  leading?: ReactNode;
  /** The row's name: 16 px, wraps and is never cut (SG-TYPE-05). */
  title: ReactNode;
  /** One line under the title, 14 px muted (SG-TYPE-02). */
  meta?: ReactNode | undefined;
  /** A value (16 px, tabular) or another trailing element; neutral, never green (SG-COLOR-02). */
  trailing?: ReactNode;
};

/** The ids a row's accessible description names: its meta line and its trailing element, where it has them. */
function describedIds(ids: RowIds, meta: ReactNode, trailing: ReactNode): string | undefined {
  const parts = [
    meta !== undefined ? ids.meta : null,
    trailing !== undefined ? ids.trailing : null,
  ];
  return parts.filter((part): part is string => part !== null).join(" ") || undefined;
}

/**
 * One row of a `GroupedList`: a link, a button or plain content. A navigation or action row shows the neutral chevron
 * at the trailing edge, after its value, unless it is destructive or has a trailing element of its own (object rows,
 * SG-LIST-03: at most one trailing element). Plain content never shows one.
 */
export function GroupedRow(props: GroupedRowProps) {
  const destructive = props.tone === "destructive";
  const interactive = props.to !== undefined || props.onClick !== undefined;
  const object = props.variant === "object";
  const base = useId();
  const ids: RowIds = {
    title: `${base}-title`,
    meta: `${base}-meta`,
    trailing: `${base}-trailing`,
  };
  const hasOwnTrailing = object && props.trailing !== undefined;
  const chevron = interactive && !destructive && !hasOwnTrailing && props.chevron !== false;
  const look = cn(
    ROW,
    object && OBJECT_ROW,
    interactive && INTERACTIVE,
    props.current && "bg-muted",
    destructive && "text-destructive",
  );
  // An object row is named by its title; the meta and the trailing element describe it (WCAG 2.5.3, US-QS-32).
  const named: AriaLabels =
    object && interactive
      ? {
          "aria-labelledby": ids.title,
          "aria-describedby": describedIds(ids, props.meta, props.trailing),
        }
      : {};
  const body = (
    <RowElement
      id={props.id}
      to={props.to}
      onClick={props.onClick}
      haspopup={props.haspopup}
      expanded={props.expanded}
      current={props.current}
      look={look}
      named={named}
    >
      <RowContent
        leading={props.leading}
        title={props.title}
        meta={props.meta}
        trailing={props.trailing}
        current={props.current === true}
        destructive={destructive}
        chevron={chevron}
        object={object}
        ids={ids}
      />
    </RowElement>
  );
  return props.bare ? body : <li className={HAIRLINE}>{body}</li>;
}
