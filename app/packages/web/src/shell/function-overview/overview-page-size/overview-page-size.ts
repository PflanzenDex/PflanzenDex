import { useSyncExternalStore } from "react";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import { useIsLg } from "@/lib/use-breakpoint";

/** Height the page takes besides the rows of the list: app bar, heading, pager and the rest (starting value, assumption). */
const RESERVED_PX = 460;
/** Height of one row with its gap (starting value, assumption; a compact row is 48 px plus 8 px gap). */
const ROW_PX = 56;
/** Fewest rows on a page, so the list stays a list (starting value, assumption). */
const MIN_ROWS = 4;

const subscribe = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const height = () => window.innerHeight;

/**
 * Rows per page of "Was die App kann" (US-QS-15, US-QS-17). Phone and tablet use the pager's sizes; from 1024 px the
 * page takes as many rows as the window height leaves room for, so the list and its pager fit one screen. Starting
 * values, assumption; the height is read on resize.
 */
export function useOverviewPageSize(): number {
  const base = useRowPageSize();
  const lg = useIsLg();
  const h = useSyncExternalStore(subscribe, height, () => 0);
  if (!lg) return base;
  return Math.max(MIN_ROWS, Math.min(base, Math.floor((h - RESERVED_PX) / ROW_PX)));
}
