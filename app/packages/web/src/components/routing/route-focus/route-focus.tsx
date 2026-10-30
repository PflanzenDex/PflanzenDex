import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useAnnounce } from "@/platform/announcer/context";

const load = () => import("./focus-moves").then((m) => m.createFocusMover());

/** The address without the parts that are no view: a layer (`?sheet=`) and the page of a list (`?page=`) (US-QS-15). */
function viewSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("sheet");
  params.delete("page");
  params.delete("lpage");
  return params.toString();
}

/**
 * Orientation on a view change (US-QS-09, WCAG 2.4.2, 2.4.3): sets the page title (`titleOf` returns it whole), and once the new view has
 * loaded moves the focus to its main heading and announces the title politely (through the shared announcer, US-QS-10). Going back restores the focus to the
 * control that opened the view. It never moves the focus on the first load, so Tab still reaches the skip link first
 * (US-QS-08). A navigation with the state `keepFocus`, and one that only opens or closes a layer or turns the page of a list, only sets the title: the layer and the pager own their focus (US-QS-15). Render it inside the main region; it renders nothing itself.
 */
export function RouteFocus({ titleOf }: { titleOf: (pathname: string) => string }) {
  const { pathname, search, key, state } = useLocation();
  // A switch inside a view (a mode of a destination) keeps the focus on its control and announces itself (US-QS-14).
  const keepFocus = (state as { keepFocus?: boolean } | null)?.keepFocus === true;
  const type = useNavigationType();
  const title = titleOf(pathname);
  const announcer = useAnnounce();
  const previous = useRef<string | null>(null);
  const view = useRef<string | null>(null);
  const here = pathname + viewSearch(search);
  const mover = useRef<Promise<Awaited<ReturnType<typeof load>>> | null>(null);

  useEffect(() => {
    const loaded = load();
    mover.current = loaded;
    return () => void loaded.then((m) => m.dispose());
  }, []);

  // The kind of input used last, on the page root (US-QS-15): tokens.css draws no frame on a heading focused after a
  // tap or click; a key press brings the browser's focus ring back.
  useEffect(() => {
    const root = document.documentElement;
    const pointer = () => root.setAttribute("data-input", "pointer");
    const keyboard = () => root.setAttribute("data-input", "keyboard");
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, []);

  useEffect(() => {
    document.title = title;
    const left = previous.current;
    const sameView = view.current === here;
    previous.current = key;
    view.current = here;
    if (left === null || left === key || keepFocus || sameView) return;
    let stop = () => {};
    let cancelled = false;
    void mover.current?.then((m) => {
      if (!cancelled) stop = m.move(left, key, type, () => announcer?.announce(title));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [key, type, title, announcer, keepFocus, here]);

  return null;
}
