import { Link } from "react-router";
import {
  BRAND_HREF,
  BRAND_LINK_LABEL,
  DISPLAY_NAME,
} from "../../../shared/patterns/navigation/nav-item";
import { useAppBarSlot } from "../../../shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot";

/**
 * Top bar below `md` (US-QS-07, US-QS-14, US-QS-32, DS-25): the brand, which links home, while no page claims the bar. A
 * page with a header (`PageHeader`) claims it: its title, its way back and its actions then fill the bar, and the brand
 * waits (SG-HEAD-01, SG-HEAD-02). The destinations are in the bottom bar there; from `md` the rail or the sidebar carries
 * the brand and the destinations, so the header is hidden. It scrolls with the content (US-QS-14); from 30 rem of window
 * height (the `tall-window` variant) it is sticky at the top.
 */
export function GlobalHeader() {
  const bar = useAppBarSlot();
  return (
    <header className="top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] tall-window:sticky md:hidden">
      {bar?.claimed ? null : (
        <Link
          to={BRAND_HREF}
          aria-label={BRAND_LINK_LABEL}
          className="flex min-h-[44px] items-center text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {DISPLAY_NAME}
        </Link>
      )}
      <div
        data-app-bar-slot=""
        ref={bar?.setElement}
        className="flex min-w-0 flex-1 items-center empty:hidden"
      />
    </header>
  );
}
