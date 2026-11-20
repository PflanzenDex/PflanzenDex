import * as React from "react";
import { useFormContext, useFormState } from "react-hook-form";

/**
 * Contexts of the Form family (US-QS-07, DS-48): the field name from FormField and, per FormItem, the shared id plus
 * which description and message elements are rendered, so `aria-describedby` never names a missing id (US-QS-14).
 */
type FieldContextValue = { name: string };
export const FieldContext = React.createContext<FieldContextValue | null>(null);
type ItemPart = "description" | "message";
type ItemContextValue = {
  id: string;
  rendered: Record<ItemPart, boolean>;
  setRendered: (part: ItemPart, shown: boolean) => void;
};
export const ItemContext = React.createContext<ItemContextValue | null>(null);

/** Tells the surrounding FormItem whether a description or message element is on the page (US-QS-14). */
export function useRenderedPart(part: ItemPart, shown: boolean) {
  const setRendered = React.useContext(ItemContext)?.setRendered;
  React.useLayoutEffect(() => {
    if (!setRendered || !shown) return;
    setRendered(part, true);
    return () => setRendered(part, false);
  }, [setRendered, part, shown]);
}

/** State of one FormItem: its id and which of its parts are on the page. */
export function useItemContextValue(): ItemContextValue {
  const id = React.useId();
  const [rendered, setParts] = React.useState<Record<ItemPart, boolean>>({
    description: false,
    message: false,
  });
  const setRendered = React.useCallback(
    (part: ItemPart, shown: boolean) => setParts((prev) => ({ ...prev, [part]: shown })),
    [],
  );
  return React.useMemo(() => ({ id, rendered, setRendered }), [id, rendered, setRendered]);
}

export function useFormField() {
  const field = React.useContext(FieldContext);
  const item = React.useContext(ItemContext);
  const { getFieldState } = useFormContext();
  const state = useFormState({ name: field?.name ?? "" });
  if (!field || !item)
    throw new Error("FormLabel, FormControl and friends belong inside FormField and FormItem");
  const { error } = getFieldState(field.name, state);
  const { id, rendered } = item;
  return {
    id,
    name: field.name,
    error,
    rendered,
    controlId: `${id}-control`,
    descriptionId: `${id}-description`,
    messageId: `${id}-message`,
  };
}

/** The send button of this form that a mouse event hit, or `null`. */
function sendOf(event: React.MouseEvent<HTMLFormElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const send = target?.closest<HTMLButtonElement | HTMLInputElement>(
    "button[type='submit'], input[type='submit']",
  );
  return send && send.form === event.currentTarget ? send : null;
}

/**
 * A press on a send button of its form while a field of that form has the focus: the field keeps it until the press
 * ends (issue 2216, US-QS-32). Leaving it first runs its check on leaving, the message (and a closing phone keyboard)
 * moves the page under the finger, the release lands beside the button and the tap sends nothing. `own` is the
 * caller's handler, run first. The click then moves the focus (`focusSend`).
 */
export function keepFieldFocus(
  event: React.MouseEvent<HTMLFormElement>,
  own?: React.MouseEventHandler<HTMLFormElement>,
) {
  own?.(event);
  const send = sendOf(event);
  const focused = document.activeElement;
  if (event.defaultPrevented || !send || !focused || focused === send) return;
  if (event.currentTarget.contains(focused)) event.preventDefault();
}

/**
 * The click of that press gives the send button the focus the press did not, before the send runs (US-QS-14): a valid
 * send keeps it on the busy button, a refused one moves it to the first wrong field. Enter in a field sends with a
 * click of `detail` 0 and keeps the focus in the field.
 */
export function focusSend(event: React.MouseEvent<HTMLFormElement>) {
  const send = sendOf(event);
  if (send && event.detail > 0 && document.activeElement !== send) send.focus();
}
