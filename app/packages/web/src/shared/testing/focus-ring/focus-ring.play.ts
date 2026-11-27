import { check, hasLayout, must } from "@/shared/testing/story-frame/story-play";

/**
 * The focus ring against the boxes that clip it (US-QS-15, WCAG 2.4.7, DS-37, issue 2647). A row sits in a list that clips its
 * content (`overflow-hidden` on a group or a row, a vertical scroll on a scrolling list), and a ring outside the row's own box is
 * cut off there. The helper gives every link and button of a story the focus and checks that the ring stays inside every clipping
 * ancestor:
 * - the ring of the page: the box shadow of the focused element (a ring has no offset and no blur; `ring-inset` lies inside the
 *   box, `ring-2` with `ring-offset-2` reaches 4 px out), and an outline when the element has one;
 * - the outline of forced colors: the story's browser cannot emulate that media, so the helper reads the shipped rule
 *   (`@media (forced-colors: active) { :focus-visible { … } }` of `tokens.css`) from the style sheets and applies its geometry.
 * A play that calls it runs in jsdom too, where only the structure is checked and every measure passes: the conformance run and
 * `make sb-test` judge the boxes.
 */

/** Layout rounds a box to a fraction of a pixel: a ring this close to a clip edge still shows whole. */
const CLEAR_PX = 0.5;

const LENGTH = /-?\d*\.?\d+px/g;

const px = (value: string): number | null =>
  /^-?\d*\.?\d+px$/.test(value) ? parseFloat(value) : null;

/** The parts of a list that a comma separates, outside brackets (a computed colour holds commas). */
function splitList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

type Ring = { spread: number; inset: boolean };

/** The rings of a computed `box-shadow`: the shadows without offset and blur that have a spread (an elevation shadow is no ring). */
function ringsOf(boxShadow: string): Ring[] {
  if (boxShadow === "none") return [];
  const rings: Ring[] = [];
  for (const part of splitList(boxShadow)) {
    const lengths = (part.replace(/\w+\([^)]*\)/g, " ").match(LENGTH) ?? []).map(parseFloat);
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    if (x === 0 && y === 0 && blur === 0 && spread > 0)
      rings.push({ spread, inset: /\binset\b/.test(part) });
  }
  return rings;
}

/** How far the focus indicator of the page reaches beyond the box of the element, and whether there is one. */
function pageRing(element: HTMLElement): { reach: number; shown: boolean } {
  const style = getComputedStyle(element);
  const rings = ringsOf(style.boxShadow);
  const outline = style.outlineStyle !== "none" && (px(style.outlineWidth) ?? 0) > 0;
  const outlineReach = outline ? (px(style.outlineOffset) ?? 0) + (px(style.outlineWidth) ?? 0) : 0;
  const shadowReach = Math.max(0, ...rings.filter((r) => !r.inset).map((r) => r.spread));
  return { reach: Math.max(shadowReach, outlineReach), shown: rings.length > 0 || outline };
}

type Outline = { width: number; offset: number };

/**
 * The line width and the offset of the rule that gives the focus an outline in forced colors, as written in the style sheets.
 * A style rule has `cssRules` too (nested rules), so it is told by its `selectorText` first.
 */
function forcedColorsOutline(rules: CSSRuleList, inForced = false): Outline | null {
  let found: Outline | null = null;
  for (const rule of Array.from(rules)) {
    if ("selectorText" in rule) {
      const { selectorText, style } = rule as CSSStyleRule;
      const width = px(style.getPropertyValue("outline-width"));
      const offset = px(style.getPropertyValue("outline-offset"));
      if (inForced && selectorText === ":focus-visible" && width !== null && offset !== null)
        found = { width, offset };
    } else if ("cssRules" in rule) {
      const media = "media" in rule ? String((rule as CSSMediaRule).media.mediaText) : "";
      const inner = forcedColorsOutline(
        (rule as CSSGroupingRule).cssRules,
        inForced || /forced-colors:\s*active/.test(media),
      );
      found = inner ?? found;
    }
  }
  return found;
}

/** The forced-colors outline of the loaded style sheets; a sheet of another origin is closed to the page and holds none of ours. */
function shippedForcedOutline(): Outline | null {
  let found: Outline | null = null;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    found = forcedColorsOutline(rules) ?? found;
  }
  return found;
}

const nameOf = (element: Element): string =>
  `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(/\s+/)[0]}` : ""}`;

/** Fails when the ring (the box of `element`, `reach` px out on every side) leaves an ancestor that clips the content. */
function checkInsideClips(element: HTMLElement, what: string, reach: number): void {
  if (reach <= 0) return;
  const box = element.getBoundingClientRect();
  for (let up = element.parentElement; up !== null && up !== document.body; up = up.parentElement) {
    const style = getComputedStyle(up);
    const clipsX = style.overflowX !== "visible";
    const clipsY = style.overflowY !== "visible";
    if (!clipsX && !clipsY) continue;
    const area = up.getBoundingClientRect();
    const left = area.left + up.clientLeft;
    const top = area.top + up.clientTop;
    const cut = [
      ["left", clipsX ? left - (box.left - reach) : 0],
      ["right", clipsX ? box.right + reach - (left + up.clientWidth) : 0],
      ["top", clipsY ? top - (box.top - reach) : 0],
      ["bottom", clipsY ? box.bottom + reach - (top + up.clientHeight) : 0],
    ] as const;
    for (const [side, over] of cut)
      check(
        over <= CLEAR_PX,
        `${what} of ${nameOf(element)} "${(element.textContent ?? "").trim().slice(0, 24)}" runs ${Math.round(over * 10) / 10} px past the ${side} edge of ${nameOf(up)}, which clips it`,
      );
  }
}

/**
 * Gives every link and button of the story the focus (or the elements of `selector`) and checks that the focus ring of the page
 * and the outline of forced colors lie inside every ancestor that clips. The story must show the controls inside the clipping
 * list that the check is about, at the edge of it where a ring outside the box would be cut.
 */
export function checkFocusRings(canvas: HTMLElement, selector = "a[href], button"): void {
  const targets = Array.from(canvas.querySelectorAll<HTMLElement>(selector));
  check(targets.length > 0, `the story shows no control of "${selector}"`);
  const first = must(targets[0], "a control");
  if (!hasLayout(first)) return;
  const forced = must(
    shippedForcedOutline(),
    "the rule of forced colors for :focus-visible in the style sheets",
  );
  for (const target of targets) {
    target.focus();
    check(document.activeElement === target, `${nameOf(target)} did not take the focus`);
    const ring = pageRing(target);
    check(ring.shown, `${nameOf(target)} shows no focus ring (no box shadow ring, no outline)`);
    checkInsideClips(target, "the focus ring", ring.reach);
    checkInsideClips(target, "the forced-colors outline", forced.offset + forced.width);
    target.blur();
  }
}
