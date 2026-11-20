import { useSyncExternalStore } from "react";

/** Tailwind `lg` (1024 px): from this width a layer is a pane beside the list (US-QS-15). */
const LG_QUERY = "(min-width: 1024px)";

function subscribeLg(onChange: () => void): () => void {
  const query = window.matchMedia(LG_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True from the `lg` breakpoint (1024 px) up; follows viewport changes live. Its own module, not `use-breakpoint`: the
 * start frame reads `useIsMd` from there, and the lazy pages that read this one must not add it to the start (issue 2242).
 */
export function useIsLg(): boolean {
  return useSyncExternalStore(
    subscribeLg,
    () => window.matchMedia(LG_QUERY).matches,
    () => false,
  );
}
