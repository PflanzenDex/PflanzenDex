// DS-37 stylesheet check: the owner-decided exception of the focus ring (docs/guides/reference/design-system.md, DS-37).
// Used by check-design-system-rules.mjs; reads CSS by its braces so that the selector of a declaration is known.

/**
 * DS-37 exception (owner decision 2026-10-30, #1034, US-QS-15): a heading or the main region that the app focuses
 * after a navigation may drop its outline while the last input was not the keyboard. Only this selector, and only in
 * the token file, may carry `outline: none`; keyboard input keeps the ring.
 */
export const DS37_EXCEPTION =
  ':root:not([data-input="keyboard"]) :is(h1, main)[tabindex="-1"]:focus';

const normaliseSelector = (selector) => selector.replace(/\s+/g, " ").trim();

/**
 * Line numbers of `outline: none` or `outline: 0` declarations whose enclosing selector is not `allowed` (null allows
 * none). The stylesheet is read by its braces, so nested blocks such as `@layer base { … }` keep the right selector.
 */
export function outlineLines(css, allowed = null) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const selectors = [];
  const found = [];
  let start = 0;
  const check = (end) => {
    const part = text.slice(start, end);
    if (!/^\s*outline\s*:\s*(?:none|0)\b/i.test(part)) return;
    const selector = selectors.at(-1) ?? "";
    if (allowed !== null && normaliseSelector(selector) === normaliseSelector(allowed)) return;
    const at = start + part.length - part.trimStart().length;
    found.push(text.slice(0, at).split("\n").length);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      selectors.push(text.slice(start, i));
      start = i + 1;
    } else if (ch === "}") {
      check(i);
      selectors.pop();
      start = i + 1;
    } else if (ch === ";") {
      check(i);
      start = i + 1;
    }
  }
  return found;
}
