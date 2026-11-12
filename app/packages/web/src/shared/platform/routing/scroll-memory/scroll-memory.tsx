import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { mainRegion } from "../route-focus/view-start";

/** The scroll offsets of one history entry: the document and the inner scrollers of a one-screen view (issue 1655). */
type Offsets = { page: number; main: number; fill: number };

/** How long Back waits for a lazy view and its data to be tall enough (starting value, assumption). */
const MAX_WAIT_MS = 3000;
/** Input that means the person took over: the restore stops and leaves the scroll alone. */
const TAKE_OVER = ["keydown", "pointerdown", "wheel", "touchstart"] as const;

/** The last offsets of each history entry, by its key; one page load long, as the browser keeps them for pages. */
const saved = new Map<string, Offsets>();

const fillOf = () => document.querySelector<HTMLElement>("main > div > [data-fit-fill]");

function read(): Offsets {
  return {
    page: window.scrollY,
    main: mainRegion()?.scrollTop ?? 0,
    fill: fillOf()?.scrollTop ?? 0,
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1;

/** Sets each offset that differs; true once all of them hold (a view that still loads is not tall enough yet). */
function apply(target: Offsets): boolean {
  const main = mainRegion();
  const fill = fillOf();
  if (target.page > 0 && !near(window.scrollY, target.page))
    window.scrollTo({ top: target.page, behavior: "instant" });
  if (main && !near(main.scrollTop, target.main)) main.scrollTop = target.main;
  if (fill && !near(fill.scrollTop, target.fill)) fill.scrollTop = target.fill;
  const now = read();
  return (
    near(now.page, target.page) &&
    near(now.main, target.main) &&
    (!fill || near(now.fill, target.fill))
  );
}

/** Puts the offsets back frame by frame until they hold, the wait ends or the person takes over. Returns the stop. */
function restore(target: Offsets): () => void {
  const started = Date.now();
  let frame = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const input of TAKE_OVER) document.removeEventListener(input, stop, true);
  };
  const step = () => {
    if (stopped) return;
    if (apply(target) || Date.now() - started > MAX_WAIT_MS) return stop();
    frame = requestAnimationFrame(step);
  };
  for (const input of TAKE_OVER) document.addEventListener(input, stop, true);
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * Back returns to the place in a view (issue 1655, US-QS-14, NFR-13): the scroller is `main` or the filling view inside
 * it, not the document, so the browser's own scroll restoration does not apply. Every scroll records the offsets of
 * the current history entry; a Back or Forward (`POP`) to an entry puts them back once the view is tall enough. A new
 * visit starts at the top. Render it inside the main region; it renders nothing itself.
 */
export function ScrollMemory() {
  const { key } = useLocation();
  const type = useNavigationType();
  const current = useRef(key);

  useEffect(() => {
    const record = () => void saved.set(current.current, read());
    document.addEventListener("scroll", record, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", record, { capture: true });
  }, []);

  // A layout effect: the entry changes before the scroll events of the new view (a shorter view clamps the offset)
  // arrive, so they are recorded for the new entry and never overwrite the one that was left.
  useLayoutEffect(() => {
    current.current = key;
    const target = type === "POP" ? saved.get(key) : undefined;
    if (!target) return;
    return restore(target);
  }, [key, type]);

  return null;
}
