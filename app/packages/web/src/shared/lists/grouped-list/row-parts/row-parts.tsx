import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";

/** An object's name wraps to two lines before it is cut (SG-TYPE-05); its meta line is one line that truncates. */
export const OBJECT_TITLE = "line-clamp-2";
export const OBJECT_META = "truncate";

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
 * The inside of a row: the leading mark, the title and meta line, the trailing value and the chevron. The accessible name of
 * a link or button comes from this content, so it holds every visible text in its visible order (WCAG 2.5.3, US-QS-32).
 */
export function RowContent(props: RowContentProps) {
  return (
    <>
      {props.leading !== undefined && (
        <span className="flex shrink-0 items-center">{props.leading}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
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
              className={cn(
                "text-sm [overflow-wrap:anywhere]",
                !props.warning && "text-muted-foreground",
                props.object && OBJECT_META,
              )}
            >
              {props.meta}
            </span>
          </>
        )}
      </span>
      {props.trailing !== undefined && (
        <>
          {" "}
          <span className="max-w-[60%] shrink-0 text-right text-base tabular-nums text-foreground [overflow-wrap:anywhere]">
            {props.trailing}
          </span>
        </>
      )}
      {props.chevron && (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            props.warning ? "text-warning-foreground" : "text-muted-foreground",
          )}
        />
      )}
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
