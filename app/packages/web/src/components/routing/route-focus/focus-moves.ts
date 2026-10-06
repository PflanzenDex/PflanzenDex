// The focus handling of RouteFocus, loaded after the shell is painted instead of with it (DS-08).
/** Longest wait for a view to finish loading before the focus falls back to the main region. */
const MAX_WAIT_MS = 2500;

/** What the person saw when a view was left: enough to find the same control again after the view is rebuilt. */
type Opener = { id: string; tag: string; href: string | null; text: string };

const label = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

function describe(el: Element | null): Opener | null {
  if (!el || el === document.body || el.tagName === "H1") return null;
  return { id: el.id, tag: el.tagName, href: el.getAttribute("href"), text: label(el) };
}

/** Remembers the control that had the focus, so going back can find it again; `dispose` stops it. */
export function createFocusMover() {
  let last: Opener | null = null;
  const openers = new Map<string, Opener>();
  const remember = (e: FocusEvent) => {
    last = describe(e.target as Element) ?? last;
  };
  document.addEventListener("focusin", remember);
  return {
    dispose: () => document.removeEventListener("focusin", remember),
    /**
     * Moves the focus once the view `key` has loaded: back (`POP`) to the control that opened it, otherwise to its
     * main heading, and falls back to the main region. `done` runs after. The result stops the wait.
     */
    move(left: string, key: string, type: string, done: () => void) {
      if (type !== "POP" && last) openers.set(left, last);
      const opener = type === "POP" ? openers.get(key) : undefined;
      const find = () => (opener ? (locate(opener) ?? null) : mainHeading());
      return waitFor(find, (el) => {
        const target = el ?? mainHeading() ?? mainRegion();
        if (target) focusIt(target);
        done();
      });
    },
  };
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
