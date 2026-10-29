import { useIsLg, useIsMd } from "@/lib/use-breakpoint";

/** Compact rows per page (starting values, assumption; US-QS-22): 4 below 768 px, 8 from 768 px, 10 from 1024 px. */
export function useRowPageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  return lg ? 10 : md ? 8 : 4;
}
