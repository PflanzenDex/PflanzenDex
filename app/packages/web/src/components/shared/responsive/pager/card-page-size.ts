import { useSyncExternalStore } from "react";
import { useIsMd } from "@/lib/use-breakpoint";

/** A phone in landscape or a small one (360 x 640): too short for the larger page sizes. */
const SHORT_QUERY = "(max-height: 700px)";

/**
 * True while the viewport is at most 700 px high (starting value, assumption). Views use it to take a smaller page, so a
 * page of cards still fits one screen; the page size from the real free height is #1029 and replaces this.
 */
export function useIsShort(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(SHORT_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(SHORT_QUERY).matches,
    () => false,
  );
}

/**
 * Cards per page in the exchange (starting values, assumption; US-QS-20): 1 on a short phone, 2 on a phone, 3 from 768 px.
 * The page size from the free height is #1029 and replaces this.
 */
export function useCardPageSize(): number {
  const md = useIsMd();
  const short = useIsShort();
  return md ? 3 : short ? 1 : 2;
}
