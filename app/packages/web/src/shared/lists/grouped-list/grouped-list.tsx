import { useId, type MouseEventHandler, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";

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
  id?: string;
  /** Navigates: the row is a link to this address. Wins over `onClick` when both are given. */
  to?: string;
  /** Acts: the row is a button. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** The row of the open section: `aria-current="page"` and a semibold title, not colour alone (SG-COLOR-05). */
  current?: boolean;
  /** `destructive` is a red action for a destructive step (SG-COLOR-04); it has no chevron. */
  tone?: "default" | "destructive";
  /** A picture or an icon at the leading edge. */
  leading?: ReactNode;
  /** The row's name: 16 px, wraps and is never cut (SG-TYPE-05). */
  title: ReactNode;
  /** One line under the title, 14 px muted (SG-TYPE-02). */
  meta?: ReactNode;
  /** A value (16 px, tabular) or another trailing element; neutral, never green (SG-COLOR-02). */
  trailing?: ReactNode;
};

/**
 * One row of a `GroupedList`: a link, a button or plain content. A navigation or action row shows the neutral chevron
 * at the trailing edge, after its value, unless it is destructive.
 */
export function GroupedRow(props: GroupedRowProps) {
  const destructive = props.tone === "destructive";
  const interactive = props.to !== undefined || props.onClick !== undefined;
  const chevron = interactive && !destructive;
  const content = (
    <>
      {props.leading !== undefined && (
        <span className="flex shrink-0 items-center">{props.leading}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-base [overflow-wrap:anywhere]",
            props.current ? "font-semibold" : "font-normal",
            destructive && "text-destructive",
          )}
        >
          {props.title}
        </span>
        {props.meta !== undefined && (
          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {props.meta}
          </span>
        )}
      </span>
      {props.trailing !== undefined && (
        <span className="max-w-[60%] shrink-0 text-right text-base tabular-nums text-foreground [overflow-wrap:anywhere]">
          {props.trailing}
        </span>
      )}
      {chevron && (
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );
  const look = cn(
    ROW,
    interactive && INTERACTIVE,
    props.current && "bg-muted",
    destructive && "text-destructive",
  );
  return (
    <li id={props.id} className={HAIRLINE}>
      {props.to !== undefined ? (
        <Link to={props.to} aria-current={props.current ? "page" : undefined} className={look}>
          {content}
        </Link>
      ) : props.onClick !== undefined ? (
        <Button type="button" variant="ghost" size="row" onClick={props.onClick} className={look}>
          {content}
        </Button>
      ) : (
        <div className={look}>{content}</div>
      )}
    </li>
  );
}
