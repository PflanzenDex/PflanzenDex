import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router";

/** Longest wait for a view to finish loading before the focus falls back to the main region. */
const MAX_WAIT_MS = 2500;

/** What the person saw when a view was left: enough to find the same control again after the view is rebuilt. */
type Opener = { id: string; tag: string; href: string | null; text: string };

const label = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

function describe(el: Element | null): Opener | null {
  if (!el || el === document.body || el.tagName === "H1") return null;
  return { id: el.id, tag: el.tagName, href: el.getAttribute("href"), text: label(el) };
}

/** Finds the described control again: by id, otherwise by tag, address and visible text. */
function locate(o: Opener): HTMLElement | null {
  const byId = o.id ? document.getElementById(o.id) : null;
  if (byId) return byId;
  const same = Array.from(document.querySelectorAll<HTMLElement>(o.tag)).filter(
    (el) => el.getAttribute("href") === o.href && label(el) === o.text,
  );
  // The header and the bottom bar both list a destination; the one that is shown can take the focus.
  return same.find((el) => el.checkVisibility?.() ?? true) ?? null;
}

function focusIt(el: HTMLElement): boolean {
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName))
    el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: false });
  return document.activeElement === el;
}

/** Calls `done` as soon as `find` yields an element, watching the page while a lazy view loads; `cancel` stops it. */
function waitFor(find: () => HTMLElement | null, done: (el: HTMLElement | null) => void) {
  const first = find();
  if (first) {
    done(first);
    return () => undefined;
  }
  let finished = false;
  const stop = () => {
    finished = true;
    observer.disconnect();
    clearTimeout(timer);
    for (const type of ["keydown", "pointerdown"]) document.removeEventListener(type, stop, true);
  };
  const observer = new MutationObserver(() => {
    const el = find();
    if (el && !finished) {
      stop();
      done(el);
    }
  });
  // The person took over (key or tap): leave the focus alone.
  for (const type of ["keydown", "pointerdown"]) document.addEventListener(type, stop, true);
  const timer = setTimeout(() => {
    if (finished) return;
    stop();
    done(null);
  }, MAX_WAIT_MS);
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}

const mainHeading = () => document.querySelector<HTMLElement>("#inhalt h1");
const mainRegion = () => document.getElementById("inhalt");

/**
 * Orientation on a view change (US-QS-09, WCAG 2.4.2, 2.4.3): sets the page title (`titleOf` returns it whole), and once the new view has
 * loaded moves the focus to its main heading and announces the title politely. Going back restores the focus to the
 * control that opened the view. It never moves the focus on the first load, so Tab still reaches the skip link first
 * (US-QS-08). Render it inside the main region; it renders only the hidden announcement.
 */
export function RouteFocus({ titleOf }: { titleOf: (pathname: string) => string }) {
  const { pathname, key } = useLocation();
  const type = useNavigationType();
  const title = titleOf(pathname);
  const [announced, setAnnounced] = useState("");
  const last = useRef<Opener | null>(null);
  const previous = useRef<string | null>(null);
  const openers = useRef(new Map<string, Opener>());

  useEffect(() => {
    const remember = (e: FocusEvent) => {
      const o = describe(e.target as Element);
      if (o) last.current = o;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);

  useEffect(() => {
    document.title = title;
    const left = previous.current;
    previous.current = key;
    if (left === null || left === key) return;
    if (type !== "POP" && last.current) openers.current.set(left, last.current);
    const opener = type === "POP" ? openers.current.get(key) : undefined;
    const find = () => (opener ? (locate(opener) ?? null) : mainHeading());
    return waitFor(find, (el) => {
      // Back to a view whose opener is gone falls back to the heading, then to the main region.
      const target = el ?? mainHeading() ?? mainRegion();
      if (target) focusIt(target);
      setAnnounced(title);
    });
  }, [key, type, title]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announced}
    </div>
  );
}
