import { Link } from "react-router";
import {
  BRAND_HREF,
  DISPLAY_NAME,
  brandLink,
  topBar,
} from "../../../shared/patterns/navigation/nav-item";
import { BRAND_LINK_LABEL } from "../../../shared/patterns/navigation/navigation/navigation";
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
    <header className={topBar}>
      {bar?.claimed ? null : (
        <Link to={BRAND_HREF} aria-label={BRAND_LINK_LABEL} className={brandLink}>
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
