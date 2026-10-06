import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useAnnounce } from "@/platform/announcer/context";

const load = () => import("./focus-moves").then((m) => m.createFocusMover());

/**
 * Orientation on a view change (US-QS-09, WCAG 2.4.2, 2.4.3): sets the page title (`titleOf` returns it whole), and once the new view has
 * loaded moves the focus to its main heading and announces the title politely (through the shared announcer, US-QS-10). Going back restores the focus to the
 * control that opened the view. It never moves the focus on the first load, so Tab still reaches the skip link first
 * (US-QS-08). Render it inside the main region; it renders nothing itself.
 */
export function RouteFocus({ titleOf }: { titleOf: (pathname: string) => string }) {
  const { pathname, key } = useLocation();
  const type = useNavigationType();
  const title = titleOf(pathname);
  const announcer = useAnnounce();
  const previous = useRef<string | null>(null);
  const mover = useRef<Promise<Awaited<ReturnType<typeof load>>> | null>(null);

  useEffect(() => {
    const loaded = load();
    mover.current = loaded;
    return () => void loaded.then((m) => m.dispose());
  }, []);

  useEffect(() => {
    document.title = title;
    const left = previous.current;
    previous.current = key;
    if (left === null || left === key) return;
    let stop = () => {};
    let cancelled = false;
    void mover.current?.then((m) => {
      if (!cancelled) stop = m.move(left, key, type, () => announcer?.announce(title));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [key, type, title, announcer]);

  return null;
}
