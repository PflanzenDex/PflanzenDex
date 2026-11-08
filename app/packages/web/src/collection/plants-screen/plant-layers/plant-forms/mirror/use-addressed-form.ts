import { useLayoutEffect, useRef } from "react";
import { NOT_FOUND, type FormAddress, type FormKind } from "../address/form-address";

/**
 * A form whose open state lives in its own hook (`useMarker` and the others) follows the address (US-QS-15): the address
 * opens it once its target is known (a reload reads the plant first), Back closes it, and a form that closed itself
 * after a save or a cancel leaves the address. A plant that cannot be read closes the address with a notice (P-10).
 */
export function useAddressedForm<T>(p: {
  kind: FormKind;
  form: Pick<FormAddress, "kind" | "leave">;
  open: T | null;
  setOpen: (target: T | null) => void;
  /** The target of the form from the plant; `undefined` while the plant loads. */
  target: T | undefined;
  /** The plant could not be read. */
  failed: boolean;
}): void {
  const { kind, form, open, setOpen, target, failed } = p;
  const { leave } = form;
  const active = form.kind === kind;
  const wasActive = useRef(false);
  const attempted = useRef(false);
  const closing = useRef(false);
  useLayoutEffect(() => {
    if (!active) {
      // Back took the address away: the form closes too. A form that its own handler opened is set before its address
      // arrives, so the state is only closed when the address was there before.
      if (wasActive.current && open) setOpen(null);
      wasActive.current = false;
      attempted.current = false;
      closing.current = false;
      return;
    }
    wasActive.current = true;
    if (closing.current) return;
    if (open) {
      attempted.current = true;
      return;
    }
    if (attempted.current) {
      // The form closed itself (saved or cancelled): the address leaves the form too.
      closing.current = true;
      leave();
      return;
    }
    if (target) {
      attempted.current = true;
      setOpen(target);
      return;
    }
    if (failed) {
      closing.current = true;
      leave(NOT_FOUND);
    }
  }, [active, open, target, failed, leave, setOpen]);
}
