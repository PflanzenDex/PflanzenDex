// Part of the browser toolbox of the keyboard walk (FR-QG-24, issue 467), see walk-page.ts: the focus indicator and
// whether an element is covered. Serialized into the page, so it may use nothing but its own body.
import type { KitWindow } from "./walk-page";

// Part 2: the focus indicator (outline or box shadow that paints) and whether the element is covered.
export function installLook(): void {
  const kit = (window as unknown as KitWindow).__kw;
  const alpha = (c: string): number => {
    const m = /rgba?\(([^)]*)\)/.exec(c);
    if (!m) return c === "transparent" ? 0 : 1;
    const parts = (m[1] ?? "").split(/[ ,/]+/).filter(Boolean);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };
  // box-shadow values split at the commas outside of parentheses
  const shadowParts = (s: string): string[] => {
    const parts: string[] = [""];
    let depth = 0;
    for (const ch of s) {
      depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      if (ch === "," && depth === 0) parts.push("");
      else parts[parts.length - 1] += ch;
    }
    return parts;
  };
  const shadowShown = (s: string): boolean =>
    s !== "none" &&
    shadowParts(s).some((part) => {
      const px = part.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? [];
      return alpha(part) > 0 && px.some((n) => parseFloat(n) !== 0);
    });
  kit.ring = (el) => {
    const cs = getComputedStyle(el);
    const outline =
      cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && alpha(cs.outlineColor) > 0;
    return outline || shadowShown(cs.boxShadow);
  };
  // WCAG 2.4.11: not entirely hidden = inside the window and at least one sampled point is the element or a relative.
  kit.covered = (el) => {
    const r = el.getBoundingClientRect();
    const [x1, y1] = [Math.max(0, r.left), Math.max(0, r.top)];
    const [x2, y2] = [Math.min(window.innerWidth, r.right), Math.min(window.innerHeight, r.bottom)];
    if (x2 - x1 < 1 || y2 - y1 < 1) return { inViewport: false, covered: true };
    const points: [number, number][] = [
      [(x1 + x2) / 2, (y1 + y2) / 2],
      [x1 + 1, y1 + 1],
      [x2 - 1, y1 + 1],
      [x1 + 1, y2 - 1],
      [x2 - 1, y2 - 1],
    ];
    const hit = points.some(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      const control = (top?.closest("label") as HTMLLabelElement | null)?.control;
      return !!top && (el.contains(top) || top.contains(el) || control === el);
    });
    return { inViewport: true, covered: !hit };
  };
}
