import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** The top bar below `md` as the place a page's header goes (US-QS-32, SG-HEAD-01); see `AppBarSlotProvider`. */
export type AppBarSlot = {
  /** The element of the bar that takes the header's row; `null` until the bar has mounted. */
  element: HTMLElement | null;
  /** The bar hands in its element (a ref callback). */
  setElement: (element: HTMLElement | null) => void;
  /** Whether a page has claimed the bar: then the bar shows the page's header and no brand. */
  claimed: boolean;
  /**
   * The claim that shows in the bar: the first header that is still mounted (issue 2230). Several headers can be mounted at
   * once, e.g. a skeleton's header while the page's own header is there; only this one renders its row into the bar.
   */
  owner: string | null;
  /** A header claims the bar under its id while it is mounted; the function it returns gives the claim back. Stable across renders. */
  claim: (id: string) => () => void;
};

const AppBarSlotContext = createContext<AppBarSlot | null>(null);

/**
 * The top bar below `md` can carry the header of the page (US-QS-32, SG-HEAD-01, SG-HEAD-02). The shell mounts this provider.
 * The bar renders the element it hands in (`data-app-bar-slot`); a `PageHeader` below `md` claims the bar while it is
 * mounted, and the first claim that is still mounted is the one whose row the bar shows, so one title is in the bar at a time
 * (issue 2230). While no page claims the bar, the bar shows the brand. Without a provider a header stays in the content, as
 * it does from `md` up.
 */
export function AppBarSlotProvider(props: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<readonly string[]>([]);
  const claim = useCallback((id: string) => {
    setClaims((list) => [...list, id]);
    return () => setClaims((list) => list.filter((other) => other !== id));
  }, []);
  const value = useMemo<AppBarSlot>(
    () => ({
      element,
      setElement,
      claimed: claims.length > 0,
      owner: claims[0] ?? null,
      claim,
    }),
    [element, claims, claim],
  );
  return <AppBarSlotContext.Provider value={value}>{props.children}</AppBarSlotContext.Provider>;
}

/** The bar of the shell, or `null` where no shell mounts the provider (a test or a story of one component). */
export function useAppBarSlot(): AppBarSlot | null {
  return useContext(AppBarSlotContext);
}

/**
 * A header in the bar claims the bar under its own id while `inBar` (`claim` is stable, so the claim runs once per header).
 * Returns whether the header holds the bar's claim now: the first one mounted does, the others render nothing there
 * (issue 2230).
 */
export function useBarClaim(inBar: boolean): boolean {
  const bar = useContext(AppBarSlotContext);
  const id = useId();
  const claim = bar?.claim;
  useLayoutEffect(() => {
    if (!inBar || !claim) return;
    return claim(id);
  }, [inBar, id, claim]);
  return bar?.owner === id;
}
