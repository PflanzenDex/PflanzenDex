/**
 * True when the text size is raised to 150 % or more (US-QS-21, WCAG 1.4.4). Media queries do not follow the root font size,
 * so a view reads it: a sticky row of decision buttons would cover the card at large text, so it scrolls with the content
 * (US-QS-32). The picture of a card no longer reads it: it is the full width of its card at every size (issue 2421).
 */
export function largeText(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24;
}
