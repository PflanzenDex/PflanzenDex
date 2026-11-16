import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** The top bar below `md` as the place a page's header goes (US-QS-32, SG-HEAD-01); see `AppBarSlotProvider`. */
export type AppBarSlot = {
  /** The element of the bar that takes the header's row; `null` until the bar has mounted. */
  element: HTMLElement | null;
  /** The bar hands in its element (a ref callback). */
  setElement: (element: HTMLElement | null) => void;
  /** Whether a page has claimed the bar: then the bar shows the page's header and no brand. */
  claimed: boolean;
  /** A page claims the bar while it is mounted; the function it returns gives the claim back. Stable across renders. */
  claim: () => () => void;
};

const AppBarSlotContext = createContext<AppBarSlot | null>(null);

/**
 * The top bar below `md` can carry the header of the page (US-QS-32, SG-HEAD-01, SG-HEAD-02). The shell mounts this provider.
 * The bar renders the element it hands in (`data-app-bar-slot`); a `PageHeader` below `md` renders its row into that element
 * and claims the bar while it is mounted. While no page claims the bar, the bar shows the brand. Without a provider a
 * header stays in the content, as it does from `md` up.
 */
export function AppBarSlotProvider(props: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((n) => n + 1);
    return () => setClaims((n) => n - 1);
  }, []);
  const value = useMemo<AppBarSlot>(
    () => ({ element, setElement, claimed: claims > 0, claim }),
    [element, claims, claim],
  );
  return <AppBarSlotContext.Provider value={value}>{props.children}</AppBarSlotContext.Provider>;
}

/** The bar of the shell, or `null` where no shell mounts the provider (a test or a story of one component). */
export function useAppBarSlot(): AppBarSlot | null {
  return useContext(AppBarSlotContext);
}
