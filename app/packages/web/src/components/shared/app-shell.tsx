import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { GlobalHeader } from "./global-header";
import { MobileNavBar } from "./mobile-nav-bar";
import type { NavItem } from "./nav-item";

const MAIN_ID = "inhalt";

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
    const html = document.documentElement.style;
    const update = () => {
      html.scrollPaddingTop = `${header?.getBoundingClientRect().height ?? 0}px`;
      html.scrollPaddingBottom = `${bar?.getBoundingClientRect().height ?? 0}px`;
    };
    const observer = new ResizeObserver(update);
    for (const el of [header, bar]) if (el) observer.observe(el);
    update();
    return () => {
      observer.disconnect();
      html.scrollPaddingTop = "";
      html.scrollPaddingBottom = "";
    };
  }, [shell]);
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
 * Page frame (US-QS-07, DS-21, DS-22, DS-25): header, content and the bottom bar below `md`. `min-h-dvh`, no
 * horizontal scroll, and `main` keeps bottom padding for the sticky bar plus the safe area.
 * One `items` list is the single source of destinations for header and bar. The skip link comes first (US-QS-08).
 */
export function AppShell({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  useStickyScrollPadding(shell);
  return (
    <div
      ref={shell}
      className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground"
    >
      <a
        href={`#${MAIN_ID}`}
        onClick={skipToContent}
        className="sr-only rounded-md bg-background font-semibold text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Zum Inhalt springen
      </a>
      <GlobalHeader items={items} />
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-0"
      >
        {children}
      </main>
      <MobileNavBar items={items} />
    </div>
  );
}
