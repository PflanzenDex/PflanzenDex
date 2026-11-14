import * as React from "react";

/** The return-key hints of the HTML standard (`enterkeyhint`). */
type EnterKeyHint = NonNullable<React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"]>;

/** Input types that take text. A checkbox, radio, file, range or colour takes none, so it gets no return-key hint. */
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

/** Input types that are no field of a form: buttons and hidden values. */
const NOT_A_FIELD = new Set(["button", "submit", "reset", "image", "hidden"]);

/** A control the keyboard reaches in a form: an input, a select or a textarea. */
type KeyboardField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Whether the keyboard reaches the element: it is a field, it is enabled, the browser shows it (`display: none`, a closed
 * "Mehr Angaben" group and a `hidden` ancestor do not count), so Enter never moves onto a field that cannot take the
 * focus. Read from the DOM at the moment it is asked, so a group that opens counts at once. jsdom has no
 * `checkVisibility`; there the field counts as shown (as in route-focus).
 */
function isKeyboardField(el: Element): el is KeyboardField {
  const field =
    el instanceof HTMLInputElement
      ? !NOT_A_FIELD.has(el.type)
      : el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
  return (
    field &&
    !el.matches(":disabled") &&
    !el.closest("[hidden], details:not([open])") &&
    (el.checkVisibility?.() ?? true)
  );
}

/** The next field of the same form, in DOM order, that the keyboard reaches; undefined when `el` is the last one. */
function nextKeyboardField(el: KeyboardField): KeyboardField | undefined {
  if (!el.form) return undefined;
  let passed = false;
  for (const candidate of Array.from(el.form.elements)) {
    if (candidate === el) passed = true;
    else if (passed && isKeyboardField(candidate)) return candidate;
  }
  return undefined;
}

/**
 * The hint an Input gets when its caller sets none (SG-FORM-03, US-QS-32): "next" on a text field with a later field in
 * its form, "done" on the last one (Enter submits there); "search" on a search field outside any form. Other inputs get
 * no hint.
 */
function defaultEnterKeyHint(el: HTMLInputElement): EnterKeyHint | undefined {
  if (!el.form) return el.type === "search" ? "search" : undefined;
  if (!TEXT_TYPES.has(el.type)) return undefined;
  return nextKeyboardField(el) ? "next" : "done";
}

/**
 * Writes the default hint of an Input into the DOM and keeps it current. The form is watched for fields that appear or
 * go, for a group that opens, and for a field that is disabled, hidden or restyled: the field before a new field changes
 * from "done" to "next" at once, without a focus. A caller's `enterKeyHint` belongs to React and is never overwritten.
 * A change of `type` (the third argument) applies the hint of the new type.
 */
export function useEnterKeyHint(
  input: React.RefObject<HTMLInputElement | null>,
  explicit: EnterKeyHint | undefined,
  type: string,
) {
  React.useLayoutEffect(() => {
    const el = input.current;
    if (!el || explicit !== undefined) return;
    const apply = () => {
      const hint = defaultEnterKeyHint(el);
      if (hint) el.setAttribute("enterkeyhint", hint);
      else el.removeAttribute("enterkeyhint");
    };
    apply();
    if (!el.form) return;
    const watch = new MutationObserver(apply);
    watch.observe(el.form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "disabled", "hidden", "class", "style"],
    });
    return () => watch.disconnect();
  }, [input, explicit, type]);
}

/**
 * Enter in a field that says "next" moves the focus to the next keyboard field of its form instead of submitting, so the
 * key does what its label says (SG-FORM-03, US-QS-32). Every other Enter keeps the browser's own action: the submit of the
 * last field, or the confirmed send of an explicit hint. IME confirmation and modifier keys are left alone.
 */
export function moveOnWithEnter(
  event: React.KeyboardEvent<HTMLInputElement>,
  explicit: EnterKeyHint | undefined,
) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const el = event.currentTarget;
  if ((explicit ?? defaultEnterKeyHint(el)) !== "next") return;
  const next = nextKeyboardField(el);
  if (!next) return;
  event.preventDefault();
  next.focus();
}
