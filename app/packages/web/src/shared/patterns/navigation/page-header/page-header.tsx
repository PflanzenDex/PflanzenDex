import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";

/**
 * The way back of a page (US-QS-14): an icon-only chevron of 44 px (DS-15, DS-17), a ghost button because going back is a
 * tertiary action (ADR 0017). Its accessible name names the target in full, e.g. "Zurück zu Freunde". It is a link to an
 * address, or a callback for a way back inside one view (the list of the species, the Sammlung).
 */
type PageBack =
  | { label: string; to: string; state?: unknown; className?: string }
  | { label: string; onBack: () => void; className?: string };

export type PageHeaderProps = {
  /** The page name: the one h1 of the page, unless `heading` is "h2" (a section below another page's h1). */
  title: ReactNode;
  heading?: "h1" | "h2";
  /** The id of the heading; a `FullView` names its region by it. */
  headingId?: string;
  /** The way back, first in the row. Without it the header shows no back control. */
  back?: PageBack;
  /** One action beside the title (DS-62: at most one per layer). */
  action?: ReactNode;
  className?: string;
};

/**
 * The minimum width of the title (NFR-13). With an action the title is at least its longest word and no word breaks
 * inside (issue 1230): the row wraps and the action goes under the title (issue 1177). The longest word grows with the
 * text, so the action wraps instead of squeezing the title. Without an action a title beside a way back keeps 230 px, so
 * the back control sits above a narrow title (issue 1226); any other title keeps 5 rem.
 */
function titleMinimum(hasBack: boolean, hasAction: boolean): string {
  if (hasAction) return "min-w-min [overflow-wrap:normal]";
  return hasBack ? "min-w-[230px] [overflow-wrap:anywhere]" : "min-w-20 [overflow-wrap:anywhere]";
}

function BackControl(props: { back: PageBack }) {
  const { back } = props;
  const classes = cn("shrink-0", back.className);
  if ("to" in back)
    return (
      <Button
        asChild
        variant="ghost"
        size="icon"
        aria-label={back.label}
        title={back.label}
        className={classes}
      >
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
      title={back.label}
      className={classes}
      onClick={back.onBack}
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
    </Button>
  );
}

/**
 * The one header of a sub-page or a full-view page (US-QS-14, issue 1031): the way back, the one h1 with the page name
 * and at most one action, in one row. It replaces the back buttons that were a full-width outline button, a grey pill or
 * an underlined link. `data-page-header` marks the row for tests and the page frame.
 */
export function PageHeader(props: PageHeaderProps) {
  const { title, back, action, className } = props;
  const Heading = props.heading ?? "h1";
  return (
    <div data-page-header="" className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {back ? <BackControl back={back} /> : null}
      <Heading
        {...(props.headingId ? { id: props.headingId } : {})}
        className={cn(
          titleMinimum(Boolean(back), Boolean(action)),
          "flex-1 font-semibold",
          Heading === "h1" ? "text-2xl" : "text-xl",
        )}
      >
        {title}
      </Heading>
      {action ? <div className="min-w-0 max-w-full shrink-0 [&>*]:max-w-full">{action}</div> : null}
    </div>
  );
}
