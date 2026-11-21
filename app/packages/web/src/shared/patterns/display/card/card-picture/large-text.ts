/**
 * True when the text size is raised to 150 % or more (US-QS-21, WCAG 1.4.4). Media queries do not follow the root font size,
 * so a row or a picture reads it: a sticky row would cover the card at large text, so it scrolls with the content (US-QS-32).
 */
export function largeText(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24;
}
