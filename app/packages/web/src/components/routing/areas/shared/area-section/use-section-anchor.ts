import { useEffect } from "react";
import { useLocation } from "react-router";
import { useAnnounce } from "@/platform/announcer/context";

/** The ids of the section headings, by the anchor of the address. */
export const headingId = (anchor: string) => `${anchor}-title`;

/** How long a page may still grow after the jump to a section (loading sections above it). */
const SETTLE_MS = 2500;

/**
 * Brings the section named by the anchor of the address into view and moves the focus to its heading (US-QS-14,
 * WCAG 2.4.3), then tells screen readers where they are. `names` maps the anchors of the page to the section names.
 * It runs again on every navigation to the same anchor (the location key changes), so a second "Zu Behandlung" lands
 * there too. Unknown anchors change nothing. The sections above load their content one after the other, so the page
 * grows after the first scroll; while it grows (a short while, and only until the user scrolls or presses a key) the
 * heading is brought into view again, so a cold load lands on the section and not above it.
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
    if (typeof ResizeObserver === "undefined") return;
    const again = () => heading.scrollIntoView?.({ block: "start" });
    const observer = new ResizeObserver(again);
    observer.observe(document.body);
    const stop = () => observer.disconnect();
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, stop, { once: true, passive: true }));
    const timer = window.setTimeout(stop, SETTLE_MS);
    return () => {
      stop();
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [hash, key, announcer, names]);
}
