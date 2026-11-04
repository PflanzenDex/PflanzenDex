import { useEffect, useState } from "react";

/** How far before the viewport a picture starts loading, so it is there when it scrolls in (starting value, assumption). */
const LOAD_AHEAD = "200px";

/**
 * Whether an element is in view or about to be (NFR-12): a picture in a long list loads when it comes near, not when the
 * list renders. Once seen it stays in view, and the observer lets go. Without `IntersectionObserver` (jsdom, old
 * browsers) the element counts as in view at once. Returns the ref callback for the element and the flag.
 */
export function useInView<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  const supported = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    if (!node || seen || !supported) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        observer.disconnect();
      },
      { rootMargin: LOAD_AHEAD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, seen, supported]);
  return [setNode, seen || !supported];
}
