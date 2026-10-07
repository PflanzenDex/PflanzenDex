import { useEffect } from "react";
import { useLocation } from "react-router";
import { useAnnounce } from "@/platform/announcer/context";

/** The ids of the section headings, by the anchor of the address. */
export const headingId = (anchor: string) => `${anchor}-title`;

/**
 * Brings the section named by the anchor of the address into view and moves the focus to its heading (US-QS-14,
 * WCAG 2.4.3), then tells screen readers where they are. `names` maps the anchors of the page to the section names.
 * It runs again on every navigation to the same anchor (the location key changes), so a second "Zu Behandlung" lands
 * there too. Unknown anchors change nothing.
 */
export function useSectionAnchor(names: Record<string, string>) {
  const { hash, key } = useLocation();
  const announcer = useAnnounce();
  useEffect(() => {
    const anchor = hash.slice(1);
    const name = names[anchor];
    const heading = name ? document.getElementById(headingId(anchor)) : null;
    if (!heading || !name) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus();
    heading.scrollIntoView?.({ block: "start" });
    announcer?.announce(name);
  }, [hash, key, announcer, names]);
}
