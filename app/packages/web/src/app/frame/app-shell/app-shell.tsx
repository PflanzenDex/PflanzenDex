import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { KeyboardShortcutMode } from "@pflanzendex/core";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { useOnline } from "@/shared/platform/browser/network";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import {
  ShortcutProvider,
  useShortcuts,
} from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import { SHORTCUT_MODE } from "@/shared/platform/device/keyboard/keys";
import { SHORTCUT_TARGETS } from "./shortcut-targets";
import { ShortcutOverview } from "@/shared/patterns/elements/shortcut-overview/shortcut-overview";
import { Banner } from "../../../shared/patterns/states/banner/banner";
import { ToastProvider } from "../../../shared/patterns/states/toast/toast-provider/toast-provider";
import { GlobalHeader } from "../global-header/global-header";
import { SideNav } from "../side-nav/side-nav";
import { MobileNavBar } from "../mobile-nav-bar/mobile-nav-bar";
import type { NavItem } from "../../../shared/patterns/navigation/nav-item";

const MAIN_ID = "inhalt";

/** Room kept beyond a bar for the focus ring (2 px ring plus 2 px offset, doubled for sub-pixel rounding), US-QS-14. */
const FOCUS_RING_ROOM = 8;

/** The bar's real height plus the ring room; 0 while the bar is hidden (`display: none`), so rail and sidebar add none. */
function clearance(bar: Element | null | undefined): string {
  const height = bar?.getBoundingClientRect().height ?? 0;
  return `${height > 0 ? height + FOCUS_RING_ROOM : 0}px`;
}

/**
 * The bottom padding of `main` for the bar: its real height, because the class reserves 4 rem and a bar whose labels wrap
 * is taller (93 px at 412 px wide): the last line of the content sat under it. Empty while the bar is hidden (from `md`),
 * so the classes of `main` apply again.
 */
function barReserve(bar: Element | null | undefined): string {
  const height = bar?.getBoundingClientRect().height ?? 0;
  return height > 0 ? `${height}px` : "";
}

/**
 * Keeps the focused element out from under the sticky header and the fixed bottom bar (US-QS-08, WCAG 2.4.11): the
 * page's scroll padding follows their real height, which changes with wrapping, safe areas and the `md` breakpoint.
 */
function useStickyScrollPadding(shell: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = shell.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const header = root.querySelector("header");
    const bar = root.querySelector("nav[data-bottom-bar]");
    const main = root.querySelector<HTMLElement>("main");
    // From `md` the header and the bar are `display: none` and measure 0, so rail and sidebar add no padding.
    const html = document.documentElement.style;
    const update = () => {
      html.scrollPaddingTop = clearance(header);
      html.scrollPaddingBottom = clearance(bar);
      if (main) main.style.paddingBottom = barReserve(bar);
    };
    const observer = new ResizeObserver(update);
    for (const el of [header, bar]) if (el) observer.observe(el);
    update();
    return () => {
      observer.disconnect();
      html.scrollPaddingTop = "";
      html.scrollPaddingBottom = "";
      if (main) main.style.paddingBottom = "";
    };
  }, [shell]);
}

/** Says that the device is offline and what that means, as long as it lasts (US-QS-14, P-09, P-10). */
function OfflineBanner() {
  if (useOnline()) return null;
  return (
    <Banner variant="warning" title="Du bist offline" className="mb-4">
      Angezeigte Daten können veraltet sein. Änderungen werden gesendet, sobald du wieder online
      bist.
    </Banner>
  );
}

/** Moves the focus past the navigation to the main content (US-QS-08, WCAG 2.4.1), without touching the address. */
function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById(MAIN_ID);
  if (!main) return;
  event.preventDefault();
  main.focus();
  main.scrollIntoView?.({ block: "start" });
}

/**
 * Page frame (US-QS-07, US-QS-14, DS-21, DS-22, DS-25): below `md` the brand header, the content and the bottom bar;
 * from `md` a navigation rail, from `xl` a labelled sidebar next to the content. `min-h-dvh`, no horizontal scroll,
 * and `main` keeps bottom padding for the bar (below `md`) plus the safe area. Gutters 16, 24 and 40 px. Above 1920 px
 * (`max-w-480`) the frame keeps its 1920 px layout and is centred; the page colour fills the sides (US-QS-14, issue 1160).
 * One `items` list is the single source of destinations for bar, rail and sidebar. The skip link comes first (US-QS-08).
 */
/** The overview of the shortcuts, opened by `?` and by the help entry; it reads the state of the shortcut provider (US-QS-11). */
function ShortcutOverviewLayer() {
  const s = useShortcuts();
  const off = s.mode === undefined || s.mode === SHORTCUT_MODE.disabled;
  return (
    <ShortcutOverview
      open={s.overviewOpen}
      onOpenChange={s.setOverviewOpen}
      rows={s.rows}
      off={off}
    />
  );
}

export function AppShell({
  items,
  titleOf,
  shortcutMode,
  children,
}: {
  items: NavItem[];
  /** The page title of an address; with it the shell also moves the focus to the new view's heading (US-QS-09). */
  titleOf?: (pathname: string) => string;
  /** The keyboard shortcut mode of the account; `undefined` while it is not known: then no shortcut fires (US-QS-11). */
  shortcutMode?: KeyboardShortcutMode | undefined;
  children: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useStickyScrollPadding(shell);
  return (
    <ShortcutProvider mode={shortcutMode} targets={SHORTCUT_TARGETS}>
      <AnnouncerProvider>
        <ToastProvider>
          <div
            ref={shell}
            className="mx-auto flex min-h-dvh w-full max-w-480 flex-col overflow-x-clip bg-background text-foreground md:flex-row"
          >
            <a
              href={`#${MAIN_ID}`}
              onClick={skipToContent}
              className="sr-only rounded-md bg-background font-semibold text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Zum Inhalt springen
            </a>
            <SideNav items={items} />
            <div className="flex min-w-0 flex-1 flex-col">
              <GlobalHeader />
              <main
                id={MAIN_ID}
                tabIndex={-1}
                className="flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-6 md:pt-6 xl:px-10"
              >
                {titleOf ? <RouteFocus titleOf={titleOf} /> : null}
                <OfflineBanner />
                {children}
              </main>
            </div>
            <MobileNavBar items={items} />
            <ShortcutOverviewLayer />
          </div>
        </ToastProvider>
      </AnnouncerProvider>
    </ShortcutProvider>
  );
}
