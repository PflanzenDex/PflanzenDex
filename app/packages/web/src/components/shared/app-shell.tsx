import type { ReactNode } from "react";
import { GlobalHeader } from "./global-header";
import { MobileNavBar } from "./mobile-nav-bar";
import type { NavItem } from "./nav-item";

/**
 * Page frame (US-QS-07, DS-21, DS-22, DS-25): header, content and the bottom bar below `md`. `min-h-dvh`, no
 * horizontal scroll, and `main` keeps bottom padding for the sticky bar plus the safe area.
 * One `items` list is the single source of destinations for header and bar.
 */
export function AppShell({ items, children }: { items: NavItem[]; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
      <GlobalHeader items={items} />
      <main className="flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-0">
        {children}
      </main>
      <MobileNavBar items={items} />
    </div>
  );
}
