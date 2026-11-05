import { useEffect, useState } from "react";

/** The system asks for less motion (WCAG 2.3.3, US-QS-14); CSS covers the transitions, the card logic reads it too. */
const QUERY = "(prefers-reduced-motion: reduce)";

const supported = () => typeof window.matchMedia === "function";

/** True while the system asks for reduced motion; without `matchMedia` (old browsers, jsdom) it is false. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => supported() && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (!supported()) return;
    const query = window.matchMedia(QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
