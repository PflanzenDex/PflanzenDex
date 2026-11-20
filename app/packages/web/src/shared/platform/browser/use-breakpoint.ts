import { useSyncExternalStore } from "react";

/** Tailwind `md` (DS-23, DS-24): from this width modals are dialogs and lists are tables. */
const MD_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(MD_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MD_QUERY).matches;
}

/** True from the `md` breakpoint (768 px) up; follows viewport changes live. */
export function useIsMd(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
