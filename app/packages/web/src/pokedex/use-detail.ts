import type { CaughtSpecies } from "@pflanzendex/core";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Marks the history entry that stands for an open detail view and names its species, so Back can be told apart from
 * other entries and Forward (or Back from a later page) opens the same species again instead of an empty entry (#306).
 */
type DetailState = { pokedexDetail?: boolean; species?: string };
const detailState = (species: string): DetailState => ({ pokedexDetail: true, species });
const isDetailEntry = () => (window.history.state as DetailState | null)?.pokedexDetail === true;
/** The species of the current history entry when it is a detail entry, else `null`. */
const entrySpecies = () =>
  isDetailEntry() ? ((window.history.state as DetailState).species ?? null) : null;

/**
 * The one open detail view (US-POK-09): at most one species is selected. Opening pushes a history entry, so the browser
 * Back button closes the detail instead of leaving the Pokédex; closing with the button or Escape takes that entry
 * back. After closing, the focus returns to the card that opened it and the list scrolls back to where it was.
 */
export function useDetail(caught: readonly CaughtSpecies[]) {
  const [selected, setSelected] = useState<string | null>(entrySpecies);
  const opener = useRef<string | null>(null);
  const scrollY = useRef(0);
  // Set when a close went into the history; a second trigger before popstate must not pop again.
  const closing = useRef(false);
  const open = useCallback((c: CaughtSpecies) => {
    opener.current = c.species;
    scrollY.current = window.scrollY;
    closing.current = false;
    window.history.pushState(detailState(c.species), "");
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
  // Every move through the history shows what its entry stands for: a detail entry opens its species, any other closes.
  useEffect(() => {
    const onPop = () => {
      closing.current = false;
      setSelected(entrySpecies());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
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
