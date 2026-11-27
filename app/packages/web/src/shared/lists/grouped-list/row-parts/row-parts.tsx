import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { metaParts } from "./row-parts.meta";

/**
 * An object's name wraps to two lines before it is cut (SG-TYPE-05) and breaks at German syllables, not at any letter, when
 * one word is wider than the column at 200 % text ("Schmetterlings-orchidee", `lang="de"` on the document, issue 2366). A
 * scientific name in the title is italic and carries `hyphens-manual` itself. Its meta line wraps to further lines when it is
 * long (owner decision d-168, issue 2599): nothing is hidden and the row grows only when needed. It breaks between its " · "
 * parts and not inside one, and never before a dot (`metaParts`, issue 2606); a part wider than the column wraps at its own
 * spaces, and `break-word` lets one word wider than the column break as the last resort only. `text-pretty` keeps a single
 * word from standing alone on the last line of such a part.
 */
export const OBJECT_TITLE = "line-clamp-2 hyphens-auto";
export const OBJECT_META = "text-pretty [overflow-wrap:break-word]";

export type RowContentProps = {
  leading: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  trailing: ReactNode;
  current: boolean;
  destructive: boolean;
  /** The amber row of the most urgent item: its meta line and chevron take the warning text colour. */
  warning: boolean;
  chevron: boolean;
  object: boolean;
};

/**
 * The chevron of a row that opens a view or a layer (SG-TOUCH-02, SG-ICON-01): 16 px, neutral, decorative, at the trailing
 * edge. One part for every row, so a row of another look (`LayerRow` of Freunde) draws the same mark (issue 2355).
 */
export function RowChevron(props: { warning?: boolean | undefined }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        props.warning ? "text-warning-foreground" : "text-muted-foreground",
      )}
    />
  );
}

/**
 * The inside of a row: the leading mark, the title and meta line, the trailing value and the chevron. The accessible name of
 * a link or button comes from this content, so it holds every visible text in its visible order (WCAG 2.5.3, US-QS-32).
 */
export function RowContent(props: RowContentProps) {
  return (
    <>
      {props.leading !== undefined && (
        <span className="flex shrink-0 items-center">{props.leading}</span>
      )}
      <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", props.object && "basis-[96px]")}>
        <span
          data-row-name={props.object ? "" : undefined}
          className={cn(
            "text-base [overflow-wrap:anywhere]",
            props.object && OBJECT_TITLE,
            props.current ? "font-semibold" : "font-normal",
            props.destructive && "text-destructive",
          )}
        >
          {props.title}
        </span>
        {props.meta !== undefined && (
          <>
            {" "}
            <span
              data-row-meta={props.object ? "" : undefined}
              className={cn(
                "text-sm",
                props.object ? OBJECT_META : "[overflow-wrap:anywhere]",
                !props.warning && "text-muted-foreground",
              )}
            >
              {props.object && typeof props.meta === "string" ? metaParts(props.meta) : props.meta}
            </span>
          </>
        )}
      </span>
      {props.trailing !== undefined && (
        <>
          {" "}
          <span className="ml-auto max-w-[60%] shrink-0 text-right text-base tabular-nums text-foreground [overflow-wrap:anywhere]">
            {props.trailing}
          </span>
        </>
      )}
      {props.chevron && <RowChevron warning={props.warning} />}
    </>
  );
}

/** The focusable element of a row: a link (`to`), a button (`onClick`) or plain content. */
export function RowElement(props: {
  id: string | undefined;
  to: string | undefined;
  onClick: MouseEventHandler<HTMLButtonElement> | undefined;
  haspopup: "dialog" | undefined;
  expanded: boolean | undefined;
  current: boolean | undefined;
  look: string;
  children: ReactNode;
}) {
  // The id sits on the focusable element, so a view can return the focus to the row (the Konto index does).
  if (props.to !== undefined)
    return (
      <Link
        id={props.id}
        to={props.to}
        aria-current={props.current ? "page" : undefined}
        className={props.look}
      >
        {props.children}
      </Link>
    );
  if (props.onClick !== undefined)
    return (
      <Button
        id={props.id}
        type="button"
        variant="ghost"
        size="row"
        onClick={props.onClick}
        aria-haspopup={props.haspopup}
        aria-expanded={props.expanded}
        className={props.look}
      >
        {props.children}
      </Button>
    );
  return (
    <div id={props.id} className={props.look}>
      {props.children}
    </div>
  );
}
