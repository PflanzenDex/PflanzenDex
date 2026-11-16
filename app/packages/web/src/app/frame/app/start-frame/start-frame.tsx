import { useLocation } from "react-router";
import { cn } from "@/shared/lib/utils";
import {
  DISPLAY_NAME,
  destinationHeading,
  stackedItem,
} from "@/shared/patterns/navigation/nav-item";
import { PageSkeleton } from "@/shared/patterns/states/page-skeleton/page-skeleton";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";

/** The slots of the bottom bar while the destinations are not known: the bar holds at most five (DS-25). */
const BAR_SLOTS = 5;

/**
 * The page skeleton of the address (SG-STATE-02, issue 1876): the destination's heading where its page puts it, and the
 * blocks under it. The start frame and the signed-in frame show the same one, so the start is one loading picture.
 */
export function StartPageSkeleton() {
  const heading = destinationHeading(useLocation().pathname);
  return <PageSkeleton {...(heading ? { heading } : {})} />;
}

/**
 * The frame of the signed-in app while it starts (SG-STATE-02, owner answer Q-27, issue 1876): the brand header and the
 * bottom bar below `md`, the rail from `md` and the sidebar from `xl`, with the page skeleton in the main column. It has
 * the boxes of `AppShell` (the same classes for frame, header, main and bar), so nothing moves when the shell replaces it,
 * and it shows through the session check and while the code of the shell loads. It is drawn, not operable: the bars have
 * no links yet, so it holds no control and no landmark for them.
 */
export function StartFrame() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-480 flex-col overflow-x-clip bg-background text-foreground md:flex-row">
      <div
        aria-hidden="true"
        className="sticky top-0 hidden h-dvh w-20 shrink-0 border-r border-border bg-card px-1 pt-3 md:block xl:hidden"
      >
        <Skeleton className="mx-auto size-11" />
      </div>
      <div
        aria-hidden="true"
        className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r border-border bg-card px-3 pt-3 xl:block"
      >
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] tall-window:sticky md:hidden">
          <span className="flex min-h-[44px] items-center text-lg font-bold">{DISPLAY_NAME}</span>
        </div>
        <main className="flex-1 px-4 pb-4 md:pb-6 tall-window:pb-[calc(4rem+env(safe-area-inset-bottom))] tall-window:md:pb-6 pt-4 md:px-6 md:pt-6 xl:px-10">
          <div className="mx-auto w-full max-w-180">
            <StartPageSkeleton />
          </div>
        </main>
      </div>
      <div
        aria-hidden="true"
        data-start-bar=""
        className="inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] tall-window:fixed md:hidden"
      >
        {Array.from({ length: BAR_SLOTS }, (_, i) => (
          <span key={i} className={cn(stackedItem, "flex-1")}>
            <Skeleton className="h-[30px] w-14 max-w-full rounded-full" />
            <Skeleton className="h-3 w-10 max-w-full" />
          </span>
        ))}
      </div>
    </div>
  );
}
