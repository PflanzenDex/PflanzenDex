import type { MouseEvent } from "react";
import { NavLink, useLocation, useNavigate, type NavLinkProps } from "react-router";
import { writeStored } from "@/shared/platform/browser/storage";
import { motionReduced } from "@/shared/platform/device/motion/motion-setting";
import { mainRegion } from "@/shared/platform/routing/route-focus/view-start";
import { isActivePath, type NavItem } from "../../nav-item";

/** A plain click: the primary button without a modifier. A modified click (a new tab) is left to the link. */
const plainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * Scrolls the page to its top: the window, the main region and the filling view of a one-screen destination (DS-61), which
 * scrolls inside itself. Smooth, unless the person asked for reduced motion (US-QS-33).
 */
function scrollToTop(): void {
  const behavior = motionReduced() ? "auto" : "smooth";
  window.scrollTo({ top: 0, behavior });
  const fill = document.querySelector<HTMLElement>("main > div > [data-fit-fill]");
  for (const el of [mainRegion(), fill]) el?.scrollTo({ top: 0, behavior });
}

/**
 * A link to a destination of the navigation (SG-NAV-03, owner answer Q07, US-QS-32). A tap on the destination that is current
 * does not follow the link: away from its start page it goes there, and the mode it remembers on this device is set (the
 * plants of "Sammlung", the suggestions of "Entdecken"); on the start page the page scrolls to the top. The focus stays on
 * the link (the state `keepFocus`, RouteFocus moves nothing). Other destinations and modified clicks follow the link. The
 * address is the destination's `href`; `onClick` runs first, as on a NavLink. Shared by the bottom bar, the "Mehr" drawer
 * and the side navigation.
 */
export function ReselectLink({
  item,
  onClick,
  ...props
}: Omit<NavLinkProps, "to"> & { item: NavItem }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <NavLink
      {...props}
      to={item.href}
      onClick={(event) => {
        onClick?.(event);
        if (!plainClick(event) || !isActivePath(pathname, item.href)) return;
        event.preventDefault();
        if (item.remember) writeStored(item.remember.key, item.remember.value);
        const start = item.start ?? item.href;
        if (pathname + search === start) scrollToTop();
        else navigate(start, { state: { keepFocus: true } });
      }}
    />
  );
}
