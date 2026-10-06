import type { CaughtSpecies } from "@pflanzendex/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** Marks the history entry that stands for the open detail view, so Back can be told apart from other entries. */
const DETAIL_STATE = { pokedexDetail: true };
const isDetailEntry = () =>
  (window.history.state as { pokedexDetail?: boolean } | null)?.pokedexDetail === true;

/**
 * The one open detail view (US-POK-09): at most one species is selected. Opening pushes a history entry, so the browser
 * Back button closes the detail instead of leaving the Pokédex; closing with the button or Escape takes that entry
 * back. After closing, the focus returns to the card that opened it and the list scrolls back to where it was.
 */
export function useDetail(caught: readonly CaughtSpecies[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<string | null>(null);
  const scrollY = useRef(0);
  // Set when a close went into the history; a second trigger before popstate must not pop again.
  const closing = useRef(false);
  const open = useCallback((c: CaughtSpecies) => {
    opener.current = c.species;
    scrollY.current = window.scrollY;
    closing.current = false;
    window.history.pushState(DETAIL_STATE, "");
    setSelected(c.species);
  }, []);
  // Closing goes through the history; the popstate listener below then closes the view (one path for Back and buttons).
  const close = useCallback(() => {
    if (closing.current) return;
    if (isDetailEntry()) {
      closing.current = true;
      window.history.back();
    } else setSelected(null);
  }, []);
  useEffect(() => {
    if (selected === null) return;
    const onPop = () => {
      closing.current = false;
      setSelected(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [selected]);
  useEffect(() => {
    if (selected !== null || opener.current === null) return;
    const cards = document.querySelectorAll<HTMLElement>("[data-species]");
    [...cards]
      .find((el) => el.dataset["species"] === opener.current)
      ?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY.current);
    opener.current = null;
  }, [selected]);
  const chosen = caught.find((c) => c.species === selected);
  return { chosen, open, close };
}
