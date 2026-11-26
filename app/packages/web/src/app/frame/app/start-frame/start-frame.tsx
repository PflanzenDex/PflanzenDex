import type { ReactNode } from "react";
import { useLocation } from "react-router";
import {
  BAR_SHOW_CLASS,
  BRAND_HREF,
  DISCOVER_ADDRESS,
  DISCOVER_VIEW_KEY,
  DISPLAY_NAME,
  FRIENDS_ADDRESS,
  OPERATOR_ADDRESS,
  barSlot,
  barWords,
  barWordsStyle,
  bottomBar,
  brandLink,
  stackedItem,
  stackedLabel,
  stackedPill,
  startTitleOf,
  topBar,
} from "@/shared/patterns/navigation/nav-item";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { PageSkeleton } from "@/shared/patterns/states/page-skeleton/page-skeleton";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  PageTitle,
  TitleRow,
} from "@/shared/patterns/navigation/page-header/page-title/page-title";
import { cn } from "@/shared/lib/utils";
import { TodaySkeletonBody } from "@/today";
import { OperatorRouteBody } from "@/account";
import { FriendsPageBody } from "@/social";
import { DiscoverBody } from "@/app/destinations/discover-area/discover-body/discover-body";
import { discoverViewOf, useSuggestionsOn } from "@/app/destinations/discover-area/discover-mode";
import { readStored } from "@/shared/platform/browser/storage";
import { startBarSlots } from "./bar-labels";

/**
 * The skeleton body of the address, the body its route shows while it loads (issue 2230): "Heute" for the root and for
 * "Heute" (the root redirects there), "Betreiber" for its page, and since issue 2243 "Freunde" and "Entdecken" (the mode of
 * "Entdecken" from the address, the device and the switches, as the route's fallback reads it). Every other address keeps
 * the generic page skeleton; "Sammlung" among them, its bodies are not in the start chunk (issue 2243, measured).
 */
function StartBody(props: { pathname: string; search: string }) {
  // No account and no feature state before the shell loads: every function counts as on (`useFeature`), as the route's
  // fallback reads it then, so the start and the route pick the same mode (issue 2243).
  const suggestionsOn = useSuggestionsOn();
  const address = props.pathname === "/" ? BRAND_HREF : props.pathname;
  if (address === BRAND_HREF) return <TodaySkeletonBody />;
  if (address === OPERATOR_ADDRESS) return <OperatorRouteBody />;
  if (address === FRIENDS_ADDRESS) return <FriendsPageBody />;
  if (address === DISCOVER_ADDRESS)
    return (
      <DiscoverBody
        view={discoverViewOf(props.search, readStored(DISCOVER_VIEW_KEY) ?? null, suggestionsOn)}
      />
    );
  return <PageSkeleton />;
}

/**
 * The bottom bar of the start: the same box as the shell's bar, with the slots the shell stored (`startBarSlots`), each with the
 * show class of the real bar's slot, so both layouts take the same height (issue 2249). The pill has the classes of the
 * selected-or-not pill, the label words are the words of the bar in transparent ink on the skeleton, so a label that wraps at
 * 200 % text takes the same height (issue 2230).
 */
function StartBar() {
  return (
    <div aria-hidden="true" data-start-bar="" className={bottomBar}>
      {startBarSlots().map((slot, index) => (
        <span
          key={index}
          className={cn(
            stackedItem,
            barSlot,
            BAR_SHOW_CLASS[slot.show],
            stackedLabel(false),
            "flex-1",
          )}
        >
          <span
            className={cn(stackedPill(false), "animate-pulse bg-muted motion-reduce:animate-none")}
          />
          <span
            className={cn(
              barWords,
              "rounded-control bg-muted text-transparent animate-pulse motion-reduce:animate-none",
            )}
            style={barWordsStyle(slot.label)}
          >
            {slot.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The page skeleton of the address while the shell's routes load (SG-STATE-02, issue 1876, issue 2230): the title in the top bar
 * below `md` (it claims the bar), from `md` in the content, then the body of the address. The shell shows it until the route's
 * own skeleton is there, so the start is one picture.
 */
export function StartPageSkeleton() {
  const { pathname, search } = useLocation();
  const title = startTitleOf(pathname);
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-2">
      {title !== null ? <PageTitle title={title} /> : null}
      <StartBody pathname={pathname} search={search} />
    </div>
  );
}

/**
 * The frame of the signed-in app while it starts (SG-STATE-02, owner answer Q-27, issue 1876): the brand header and the
 * bottom bar below `md`, the rail from `md` and the sidebar from `xl`, with the page skeleton in the main column. It has
 * the boxes of `AppShell` (the same classes for frame, header, main and bar), so nothing moves when the shell replaces it,
 * and it shows through the session check and while the code of the shell loads. It is drawn, not operable: the bars have
 * no links yet, so it holds no control and no landmark for them. The top bar carries the title of the address where the
 * page has one, as the page does (issue 2230); the root shows "Heute", where it redirects.
 * `body` replaces the skeleton in the main column: a failed account load shows its error there, inside both bars (F-0059, Q03).
 */
export function StartFrame({ body }: { body?: ReactNode }) {
  const { pathname, search } = useLocation();
  const title = startTitleOf(pathname);
  const md = useIsMd();
  const inBar = title !== null && !md;
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
        <div className={topBar}>
          {inBar && title !== null ? (
            <div data-app-bar-slot="" className="flex min-w-0 flex-1 items-center">
              <TitleRow title={title} inBar />
            </div>
          ) : (
            <span className={brandLink}>{DISPLAY_NAME}</span>
          )}
        </div>
        <main className="flex-1 px-4 pb-4 md:pb-6 tall-window:pb-[calc(4rem+env(safe-area-inset-bottom))] tall-window:md:pb-6 pt-4 md:px-6 md:pt-6 xl:px-10">
          <div className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-2">
            {title !== null && !inBar ? <TitleRow title={title} inBar={false} /> : null}
            {body ?? <StartBody pathname={pathname} search={search} />}
          </div>
        </main>
      </div>
      <StartBar />
    </div>
  );
}
