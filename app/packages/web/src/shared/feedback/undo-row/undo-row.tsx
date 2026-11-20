import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./undo-row.de.json";

const ui = texts(table);

/**
 * A changed row in its place for the undo window (SG-FEED-03, US-QS-32): "<result> · Rückgängig". The undo is a real
 * button with a 44 px hit area, and its name starts with the visible word (2.5.3). When the row turns into the undo row
 * from a control that is gone, the focus goes to the undo, so it is not lost to the body; a focus another control holds
 * stays where it is. Without `onUndo` the row says its result only, because a bulk write shows its undo on one row.
 * No animation: the change is a text, reduced motion needs nothing more.
 */
export function UndoRow(props: {
  result: string;
  /** What the undo is about, for the name of the button ("Gießen bei Aloe"). */
  subject: string;
  onUndo?: (() => void) | undefined;
  /** A write of the undo runs: the button stays focusable (aria-disabled), a second tap does nothing. */
  busy?: boolean | undefined;
}) {
  const undo = useRef<HTMLButtonElement>(null);
  // The focus is moved once, when the row mounts as the undo row (the control it came from is gone by then). A layout
  // effect, so the focus is on the undo in the commit that removes that control, not a frame later.
  const [mountedWithUndo] = useState(() => props.onUndo !== undefined);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (mountedWithUndo && (active === null || active === document.body)) undo.current?.focus();
  }, [mountedWithUndo]);
  return (
    <p className="text-sm">
      <span className="font-semibold">{props.result}</span>
      {props.onUndo && (
        <>
          {" · "}
          <Button
            ref={undo}
            type="button"
            variant="plain"
            size="sm"
            className="px-2 font-semibold"
            aria-disabled={props.busy || undefined}
            aria-label={ui("undoLabel", { subject: props.subject })}
            onClick={() => {
              if (!props.busy) props.onUndo?.();
            }}
          >
            {ui("undo")}
          </Button>
        </>
      )}
    </p>
  );
}
