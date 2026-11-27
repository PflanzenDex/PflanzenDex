// What a test of the button roles reads off a rendered view (US-QS-32, SG-BTN-01, SG-BTN-02, SG-COLOR-02): the classes of a
// button or link, and which of them are filled, tinted or plain. There is no outline look, so a call site is proved by the
// role it has.

/** The classes of one element. */
export const classesOf = (el: Element): string[] => (el.getAttribute("class") ?? "").split(/\s+/);

/** The buttons and links of a view that look like buttons or rows. */
const controls = (root: ParentNode): Element[] => [...root.querySelectorAll("button, a")];

/** Filled: the primary action (SG-BTN-01). */
export const isFilled = (el: Element): boolean => classesOf(el).includes("bg-primary");

/** Tinted: the secondary action (SG-BTN-01), also the look of `secondary` since the owner decision of 2026-11-20. */
export const isTinted = (el: Element): boolean =>
  classesOf(el).includes("bg-accent") && classesOf(el).includes("text-accent-foreground");

/** Plain: green text and no fill (SG-BTN-01). */
export const isPlain = (el: Element): boolean => {
  const classes = classesOf(el);
  return classes.includes("text-primary") && !classes.some((c) => /^bg-/.test(c));
};

/** Neutral: no green fill and no green text at rest, as a navigation row is (SG-COLOR-02). */
export const isNeutral = (el: Element): boolean => {
  const classes = classesOf(el);
  return (
    !classes.includes("bg-accent") &&
    !classes.includes("bg-primary") &&
    !classes.includes("text-primary")
  );
};

/** The filled controls of a view: at most one (SG-BTN-02). */
export const filledIn = (root: ParentNode): Element[] => controls(root).filter(isFilled);

/** A border of the control itself, not the forced-colors border of the base look. */
export const hasOwnBorder = (el: Element): boolean =>
  classesOf(el).some((c) => /^border(-|$)/.test(c) && !c.startsWith("border-transparent"));
