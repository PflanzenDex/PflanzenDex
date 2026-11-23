import { useEffect, useRef } from "react";
import type { RequestInput } from "../../../api/exchange-api";

/**
 * Where the focus goes when the request form of an offer closes (US-QS-32, SG-BASE-01, issue 2468; WAI-ARIA dialog pattern).
 * "Abbrechen" returns it to the "Pflanze anfragen" button that opened the form (`opener`). A sent request closes the form
 * too, and once the reload shows the offer as requested the button is gone: the focus goes to the "Angefragt" badge of that
 * card (`badge`: the ref and `tabIndex={-1}` to spread on it). The reload may arrive after the form closed, so the choice
 * is kept until its target exists. A refusal keeps the form open and moves nothing.
 */
export function useRequestFocus(
  props: { open: boolean; onSend: (input: RequestInput) => void; onCancel: () => void },
  requested: boolean,
) {
  const { open } = props;
  const opener = useRef<HTMLButtonElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const back = useRef<"cancel" | "send" | null>(null);
  useEffect(() => {
    const target = back.current === "send" ? badgeRef.current : opener.current;
    if (!back.current || !target) return;
    back.current = null;
    target.focus();
  }, [open, requested]);
  return {
    opener,
    badge: { ref: badgeRef, tabIndex: -1 },
    onSend: (input: RequestInput) => {
      back.current = "send";
      props.onSend(input);
    },
    onCancel: () => {
      back.current = "cancel";
      props.onCancel();
    },
  };
}
