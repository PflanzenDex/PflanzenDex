import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/utils";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { barRow, barTitle, contentRow, contentTitle } from "../../nav-item";
import { useAppBarSlot, useBarClaim } from "../app-bar-slot/app-bar-slot";

/**
 * The row of a page's title as its header draws it (SG-HEAD-01, issue 2230): the bar's row and title below `md`, the
 * content's row and title from `md`. A route fallback or the start frame shows the title with these classes, so the title
 * does not move when the page replaces it. It is the one h1 of the loading picture and is marked as a fallback, so the focus
 * waits for the page's own heading (RouteFocus).
 */
export function TitleRow(props: { title: string; inBar: boolean }) {
  return (
    <div data-page-header="" className={props.inBar ? barRow : contentRow}>
      <h1
        data-route-fallback=""
        className={props.inBar ? barTitle : cn(contentTitle, "font-semibold text-2xl")}
      >
        {props.title}
      </h1>
    </div>
  );
}

/**
 * The title of a loading page below and from `md` (issue 2230). Inside a shell with a bar it claims the bar like a page
 * header, and renders into the bar while it holds the claim, so the brand does not show between the start and the page;
 * without a bar, or from `md`, it stays in the content. It is light (no button, no icon): the start frame and the Heute
 * skeleton both use it, and the start chunk must not load the page header.
 */
export function PageTitle(props: { title: string }) {
  const narrow = !useIsMd();
  const bar = useAppBarSlot();
  const element = bar?.element ?? null;
  const inBar = narrow && element !== null;
  const owned = useBarClaim(inBar);
  if (!inBar) return <TitleRow title={props.title} inBar={false} />;
  return owned ? createPortal(<TitleRow title={props.title} inBar />, element) : null;
}
