import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useAnnounce } from "@/shared/platform/announcer/context";

const load = () => import("./focus-moves").then((m) => m.createFocusMover());

/**
 * The address without the parts that are no view: a layer (`?sheet=`), the first entry of a list (`?from=`, `?lfrom=`) and
 * the tab or part of a layer (`ltab`, `tab`, `teil`) (US-QS-15, issue 1315). The old page numbers (`?page=`, `?lpage=`) go
 * too: converting one to its first entry (issue 1492) is then no view change, and neither is a turned page.
 */
function viewSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("sheet");
  params.delete("from");
  params.delete("lfrom");
  params.delete("page");
  params.delete("lpage");
  params.delete("ltab");
  params.delete("tab");
  params.delete("teil");
  return params.toString();
}

/**
 * Orientation on a view change (US-QS-09, WCAG 2.4.2, 2.4.3): sets the page title (`titleOf` returns it whole), and once the new view has
 * loaded moves the focus to its main heading and announces the title politely (through the shared announcer, US-QS-10). Going back restores the focus to the
 * control that opened the view. It never moves the focus on the first load, so Tab still reaches the skip link first
 * (US-QS-08), also when the app redirects to its first view (issue 1423). A navigation with the state `keepFocus`, and one that only opens or closes a layer or turns the page of a list, only sets the title: the layer and the pager own their focus (US-QS-15). Render it inside the main region; it renders nothing itself.
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
  // Whether the person has pushed or popped a view on this page yet, and the path of the last view (issue 1423).
  const navigated = useRef(false);
  const viewPath = useRef<string | null>(null);

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
    // A redirect of the app (`<Navigate replace>`: the root address or an old one) before the person has navigated on
    // this page is the arrival at the first view, not a view change they made (issue 1423): the focus stays where it is.
    const arrival =
      left !== null && type === "REPLACE" && !navigated.current && pathname !== viewPath.current;
    if (left !== null && left !== key && type !== "REPLACE") navigated.current = true;
    previous.current = key;
    view.current = here;
    viewPath.current = pathname;
    if (left === null || left === key || keepFocus || sameView) return;
    if (arrival) return void announcer?.announce(title);
    let stop = () => {};
    let cancelled = false;
    // The mover is a chunk of its own: a key or tap before it has loaded is the person taking over, too (issue 1362).
    const takeOver = () => void (cancelled = true);
    const watch = (change: "addEventListener" | "removeEventListener") => {
      for (const input of ["keydown", "pointerdown"]) document[change](input, takeOver, true);
    };
    watch("addEventListener");
    void mover.current?.then((m) => {
      watch("removeEventListener");
      if (!cancelled) stop = m.move(left, key, type, () => announcer?.announce(title));
    });
    return () => {
      cancelled = true;
      watch("removeEventListener");
      stop();
    };
  }, [key, type, title, announcer, keepFocus, here]);

  return null;
}
