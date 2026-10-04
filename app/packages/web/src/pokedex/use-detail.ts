import type { CaughtSpecies } from "@pflanzendex/core";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one open detail view (US-POK-09): at most one species is selected; after closing the focus returns to the card
 * that opened it.
 */
export function useDetail(caught: readonly CaughtSpecies[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<string | null>(null);
  const open = useCallback((c: CaughtSpecies) => {
    opener.current = c.species;
    setSelected(c.species);
  }, []);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    if (selected !== null || opener.current === null) return;
    const cards = document.querySelectorAll<HTMLElement>("[data-species]");
    [...cards].find((el) => el.dataset["species"] === opener.current)?.focus();
    opener.current = null;
  }, [selected]);
  const chosen = caught.find((c) => c.species === selected);
  return { chosen, open, close };
}
