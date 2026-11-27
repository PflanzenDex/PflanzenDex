import type * as React from "react";

/** The return-key hints of the HTML standard (`enterkeyhint`). */
type EnterKeyHint = NonNullable<React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"]>;

/**
 * Input types that take text. They get a return-key hint, and the HTML implicit submission counts them: a form with no
 * submit button submits on Enter only when exactly one of them is in it.
 */
const TEXT_TYPES = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "number",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);

/** A field Enter can move the focus to: a text-like input or a textarea. */
type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Groups the keeper cannot reach: inert, hidden from assistive technology, hidden, or a closed "Mehr Angaben" group. */
const UNREACHABLE_GROUPS = "[inert], [aria-hidden='true'], [hidden], details:not([open])";

function isTextField(el: Element): el is TextField {
  return (
    (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) || el instanceof HTMLTextAreaElement
  );
}

/**
 * A text field the keeper can reach: enabled, not read-only, in the tab order, outside the unreachable groups, and shown by
 * the browser (`checkVisibility`; jsdom has none, so a field counts as shown there).
 */
function isReachable(el: Element): el is TextField {
  return (
    isTextField(el) &&
    !el.matches(":disabled") &&
    !el.readOnly &&
    el.tabIndex >= 0 &&
    !el.closest(UNREACHABLE_GROUPS) &&
    (el.checkVisibility?.() ?? true)
  );
}

/** A control that submits its form when it is pressed: a submit button or an image input. */
function isSubmitControl(el: Element): boolean {
  return (
    (el instanceof HTMLButtonElement && el.type === "submit") ||
    (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "image"))
  );
}

/** What the return key says and does at one field, decided from the DOM at the moment it is asked (SG-FORM-03). */
type Decision = {
  /** The hint of the return key: "next", "done", "search", or none. */
  hint: EnterKeyHint | undefined;
  /** The field Enter moves the focus to; set only when the hint is "next". */
  next: TextField | undefined;
};

const NO_HINT: Decision = { hint: undefined, next: undefined };
/** A search field says "search" and Enter submits; it never moves on. */
const SEARCH: Decision = { hint: "search", next: undefined };
/** The last text field of a form that submits says "done"; Enter keeps the browser's default and is never prevented. */
const DONE: Decision = { hint: "done", next: undefined };

/**
 * Decides the hint and the move of one Input in a single pass over the controls of its form (SG-FORM-03, US-QS-32):
 * - a search field (type search, or any input of a form with role search) says "search" and Enter submits;
 * - a field that takes no text gets no hint, and Enter keeps its default;
 * - a text field with a later reachable text field says "next", and Enter moves there over selects, checkboxes, radios
 *   and buttons;
 * - the last text field says "done", but only when the form can submit implicitly as HTML defines it: an enabled submit
 *   button, or exactly one field that blocks implicit submission. Otherwise it gets no hint and Enter keeps its default;
 * - an input with a `list` (a datalist) never says "next" and never moves on, because Enter on an open suggestion list
 *   picks a suggestion and moving the focus would swallow that pick (#2096). With a later reachable text field it gets no
 *   hint; as the last text field of a form that submits it says "done" (#2167). Enter keeps the browser's default there
 *   (it picks an open suggestion, otherwise it submits); we never prevent it for "done".
 */
function decide(el: HTMLInputElement): Decision {
  if (el.type === "search") return SEARCH;
  const form = el.form;
  if (!form) return NO_HINT;
  if (form.getAttribute("role") === "search") return SEARCH;
  if (!TEXT_TYPES.has(el.type)) return NO_HINT;
  const { next, submits } = scanForm(el, Array.from(form.elements));
  if (el.hasAttribute("list")) return !next && submits ? DONE : NO_HINT;
  if (next) return { hint: "next", next };
  return submits ? DONE : NO_HINT;
}

/**
 * One pass over the controls of the form, in tree order: the first reachable text field after `el` (the move of Enter), and
 * whether the form submits on Enter as HTML defines implicit submission (an enabled submit button, or without one exactly
 * one field that blocks implicit submission).
 */
function scanForm(
  el: HTMLInputElement,
  controls: Element[],
): { next: TextField | undefined; submits: boolean } {
  let next: TextField | undefined;
  let passed = false;
  let blocking = 0;
  let submit: Element | undefined;
  for (const control of controls) {
    if (control === el) passed = true;
    else if (passed && !next && isReachable(control)) next = control;
    if (control instanceof HTMLInputElement && TEXT_TYPES.has(control.type)) blocking++;
    if (!submit && isSubmitControl(control)) submit = control;
  }
  const submits = submit ? !submit.matches(":disabled") : blocking === 1;
  return { next, submits };
}

/**
 * Sets the return-key hint of an Input from the DOM now. The Input calls it when the field gets the focus and when it is
 * pressed, so the hint is current when the keyboard opens (SG-FORM-03). A caller's `enterKeyHint` is never overwritten.
 */
export function syncEnterKeyHint(el: HTMLInputElement) {
  const { hint } = decide(el);
  if (hint) el.setAttribute("enterkeyhint", hint);
  else el.removeAttribute("enterkeyhint");
}

/**
 * Enter in a field that says "next" moves the focus to the next text field instead of submitting, so the key does what its
 * label says (SG-FORM-03, US-QS-32). The decision is made again at the press, because the form may have changed since the
 * focus. Every other Enter keeps the browser's own action: the implicit submit, a datalist suggestion, a newline. An
 * explicit `enterKeyHint` of the caller decides in place of the default. IME confirmation and modifier keys are left alone.
 */
export function moveOnWithEnter(
  event: React.KeyboardEvent<HTMLInputElement>,
  explicit: EnterKeyHint | undefined,
) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const { hint, next } = decide(event.currentTarget);
  if ((explicit ?? hint) !== "next" || !next) return;
  event.preventDefault();
  next.focus();
}

/** The three handlers of a text-like input that carry the return-key logic, and the caller's own handlers around them. */
export type EnterKeyHandlers = {
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * The return-key behaviour of Input for any custom text field (SG-FORM-03, US-QS-32), so a field does not copy the three
 * handlers: spread the result onto the `<input>` and pass the caller's own `onFocus`, `onPointerDown` and `onKeyDown` in
 * `handlers`. The hint is set on focus and on press, unless the caller gave `enterKeyHint`; the caller's handlers run
 * first, and Enter moves on (`moveOnWithEnter`) unless the caller prevented it.
 */
export function enterKeyHandlers(
  enterKeyHint: EnterKeyHint | undefined,
  handlers: {
    onFocus?: React.FocusEventHandler<HTMLInputElement> | undefined;
    onPointerDown?: React.PointerEventHandler<HTMLInputElement> | undefined;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement> | undefined;
  },
): EnterKeyHandlers {
  return {
    onFocus(event) {
      if (enterKeyHint === undefined) syncEnterKeyHint(event.currentTarget);
      handlers.onFocus?.(event);
    },
    onPointerDown(event) {
      if (enterKeyHint === undefined) syncEnterKeyHint(event.currentTarget);
      handlers.onPointerDown?.(event);
    },
    onKeyDown(event) {
      handlers.onKeyDown?.(event);
      if (!event.defaultPrevented) moveOnWithEnter(event, enterKeyHint);
    },
  };
}
