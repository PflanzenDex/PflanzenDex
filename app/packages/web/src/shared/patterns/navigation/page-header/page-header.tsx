import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { useAppBarSlot, useBarClaim } from "./app-bar-slot/app-bar-slot";
import { barRow, barTitle, contentRow, contentTitle } from "../nav-item";

/**
 * The way back of a page (US-QS-14): an icon-only chevron of 44 px (DS-15, DS-17), a ghost button because going back is a
 * tertiary action (ADR 0017). Its accessible name names the target in full, e.g. "Zurück zu Freunde". It is a link to an
 * address, or a callback for a way back inside one view (the list of the species, the Sammlung).
 */
type PageBack =
  | { label: string; to: string; state?: unknown; className?: string }
  | { label: string; onBack: () => void; className?: string };

/** At most two trailing actions (SG-HEAD-04, SG-HEAD-05). */
export type PageActions = readonly [ReactNode] | readonly [ReactNode, ReactNode];

export type PageHeaderProps = {
  /** The page name: the one h1 of the page, unless `heading` is "h2" (a section below another page's h1). */
  title: ReactNode;
  heading?: "h1" | "h2";
  /** The id of the heading; a `FullView` names its region by it. */
  headingId?: string;
  /** The way back, first in the row. Without it the header shows no back control. */
  back?: PageBack;
  /** One action beside the title (DS-62: at most one per layer); `actions` takes up to two and replaces it. */
  action?: ReactNode;
  actions?: PageActions;
  /**
   * The object's name as the first line of a form (SG-HEAD-01): it stays in the content, never in the bar, 16 px semibold,
   * two lines at most.
   */
  subject?: ReactNode;
  /** Kept in the content below `md` too, although a bar is there: Konto keeps the product name in its bar (SG-HEAD-02). */
  inContent?: boolean;
  /** A route fallback: its heading is not the page's own, so the focus waits for the page's heading (issue 1097). */
  fallback?: boolean;
  className?: string;
};

const KEEP_WORD = "hyphens-manual"; // a hyphenation point would lower the minimum to a syllable: "Samm-lung" (issue 2231)

/**
 * The minimum width of the title (NFR-13). With an action the title is at least its longest word and no word breaks
 * inside (issue 1230): the row wraps and the action goes under the title (issue 1177). The longest word grows with the
 * text, so the action wraps instead of squeezing the title. A title beside a way back without an action claims 230 px or
 * its longest word, whichever is more: when the row cannot give that, it wraps and the back control sits above the title
 * (issues 1226, 1254). The 230 px do not grow with the text, the longest word does; `break-word` keeps that word in the
 * minimum (`anywhere` would remove it) and `max-w-full` caps it, so only a word wider than the whole column breaks. Both
 * keep the word whole (KEEP_WORD). Any other title keeps 5 rem and the hyphenation of every h1 (issue 1315).
 */
function titleMinimum(hasBack: boolean, hasAction: boolean): string {
  if (hasAction) return `min-w-min flex-1 [overflow-wrap:normal] ${KEEP_WORD}`;
  if (hasBack) return `max-w-full grow basis-[230px] [overflow-wrap:break-word] ${KEEP_WORD}`;
  return contentTitle;
}

/**
 * The title in the bar beside an action: at least its longest word, as in the content (issue 1230). Shrinking it to zero
 * made the bar 616 px tall at 200 % text (the title wrapped letter by letter), and the page grew past the window (FX-44).
 */
const BAR_TITLE_WITH_ACTION = `min-w-min flex-1 [overflow-wrap:normal] ${KEEP_WORD} text-lg font-semibold`;
/** The title in the bar: 18 px semibold without an action (`barTitle`, nav-item), with one the longer variant. */
const barTitleClass = (hasAction: boolean): string =>
  hasAction ? BAR_TITLE_WITH_ACTION : barTitle;
/** The object's name as the first line of a form (SG-HEAD-01): inline, 16 px semibold, two lines, then cut. */
export const PAGE_SUBJECT_CLASS = "m-0 line-clamp-2 break-words text-base font-semibold";

/** The icon-only way back. It carries no `title`: a native tooltip cannot be closed with Esc (US-QS-12, 1.4.13). */
function BackControl(props: { back: PageBack }) {
  const { back } = props;
  const classes = cn("shrink-0", back.className);
  if ("to" in back)
    return (
      <Button asChild variant="ghost" size="icon" aria-label={back.label} className={classes}>
        <Link to={back.to} state={back.state}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
      </Button>
    );
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={back.label}
      className={classes}
      onClick={back.onBack}
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
    </Button>
  );
}

/** The object's name of a form, inline in the content (SG-HEAD-01); the same element for every form that shows one. */
export function PageSubject(props: { children: ReactNode; className?: string }) {
  return <p className={cn(PAGE_SUBJECT_CLASS, props.className)}>{props.children}</p>;
}

/** Whether the header goes into the top bar: an h1 below `md` where a bar is on the page, unless the page keeps it in its content. */
function useInBar(heading: "h1" | "h2", element: HTMLElement | null, inContent: boolean): boolean {
  const narrow = !useIsMd();
  return heading === "h1" && narrow && element !== null && !inContent;
}

/** The row: the way back, the heading and the actions. In the bar it is the bar's row; in the content it is the page's. */
function HeaderRow(props: {
  inBar: boolean;
  heading: "h1" | "h2";
  title: ReactNode;
  headingId: string | undefined;
  fallback: boolean;
  back: PageBack | undefined;
  actions: readonly ReactNode[];
  className: string | undefined;
}) {
  const { inBar, back, actions } = props;
  const Heading = props.heading;
  const headingClass = inBar
    ? barTitleClass(actions.length > 0)
    : cn(
        titleMinimum(Boolean(back), actions.length > 0),
        "font-semibold",
        Heading === "h1" ? "text-2xl" : "text-xl",
      );
  return (
    <div data-page-header="" className={cn(inBar ? barRow : contentRow, props.className)}>
      {back ? <BackControl back={back} /> : null}
      <Heading
        {...(props.headingId ? { id: props.headingId } : {})}
        {...(props.fallback ? { "data-route-fallback": "" } : {})}
        className={headingClass}
      >
        {props.title}
      </Heading>
      {actions.map((node, index) => (
        <div key={index} className="min-w-0 max-w-full shrink-0 [&>*]:max-w-full">
          {node}
        </div>
      ))}
    </div>
  );
}

/**
 * The one header of a sub-page or a full-view page (US-QS-14, issue 1031, US-QS-32): the way back, the one h1 with the page
 * name and up to two actions, in one row. Below `md` inside an app shell the row goes into the top bar and the bar shows
 * the page's title instead of the brand (SG-HEAD-01); from `md` it stays in the content as before. `heading="h2"` is a
 * section label and never goes into the bar. `inContent` keeps the row in the content below `md` too (Konto, SG-HEAD-02).
 * `data-page-header` marks the row for tests and the page frame.
 */
export function PageHeader(props: PageHeaderProps) {
  const { title, back, className, subject } = props;
  const heading = props.heading ?? "h1";
  const bar = useAppBarSlot();
  const element = bar?.element ?? null;
  const inBar = useInBar(heading, element, props.inContent === true);
  const owned = useBarClaim(inBar);
  const actions: readonly ReactNode[] = props.actions ?? (props.action ? [props.action] : []);
  const row = (
    <HeaderRow
      inBar={inBar}
      heading={heading}
      title={title}
      headingId={props.headingId}
      fallback={props.fallback === true}
      back={back}
      actions={actions}
      className={className}
    />
  );
  // A header in the bar renders only while it holds the bar's claim: one title in the bar, the first one mounted (issue 2230).
  const header = !inBar ? row : owned && element !== null ? createPortal(row, element) : null;
  if (subject === undefined || subject === null) return header;
  return (
    <>
      {header}
      <PageSubject>{subject}</PageSubject>
    </>
  );
}
