import { useEffect, useState } from "react";
import { largeText } from "./large-text";

/**
 * `largeText`, kept current: a text size set after the view has mounted (the keeper's setting, a style rule, the one-screen
 * gate's 200 % run) lays the view out again (issue 2617, US-QS-32, WCAG 1.4.4). A hidden probe one `rem` wide reports each
 * change of the root size through a ResizeObserver; a change of the root's style or class and a window resize cover the rest.
 */
export function useLargeText(): boolean {
  const [large, setLarge] = useState(largeText);
  useEffect(() => {
    const read = () => setLarge(largeText());
    read();
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;width:1rem;height:0;visibility:hidden;pointer-events:none;overflow:hidden";
    document.body.appendChild(probe);
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    sizes?.observe(probe);
    const attributes = new MutationObserver(read);
    attributes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", read);
    return () => {
      sizes?.disconnect();
      attributes.disconnect();
      window.removeEventListener("resize", read);
      probe.remove();
    };
  }, []);
  return large;
}
