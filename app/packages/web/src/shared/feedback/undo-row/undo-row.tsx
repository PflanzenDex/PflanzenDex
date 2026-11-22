import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { LINE_HIT } from "@/shared/feedback/line-hit";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./undo-row.de.json";

const ui = texts(table);

/**
 * A changed row in its place for the undo window (SG-FEED-03, US-QS-32): "<result> · Rückgängig". The undo is a real
 * button with a 44 px hit area, and its name starts with the visible word (2.5.3). When the row turns into the undo row
 * from a control that is gone, the focus goes to the undo, so it is not lost to the body; a focus another control holds
 * stays where it is. A control that stays on the page (`from`, the button that caused the change) holds the focus until the
 * undo appears: the undo takes it from there too. Without `onUndo` the row says its result only, because a bulk write shows
 * its undo on one row. `compact` keeps the row one text line high: the button keeps its 44 px hit area through a negative
 * margin of half its overhang (`LINE_HIT`), as the achievement notice does, so a line of a view can give its place to the row (SG-FEED-05). No animation: the
 * change is a text, reduced motion needs nothing more.
 */
export function UndoRow(props: {
  result: string;
  /** What the undo is about, for the name of the button ("Gießen bei Aloe"). */
  subject: string;
  onUndo?: (() => void) | undefined;
  /** A write of the undo runs: the button stays focusable (aria-disabled), a second tap does nothing. */
  busy?: boolean | undefined;
  /** The control that caused the change and stays on the page: when it holds the focus as the row mounts, the undo takes it. */
  from?: RefObject<HTMLElement | null> | undefined;
  /** One text line high (SG-FEED-05): the button's hit area reaches above and below the line. */
  compact?: boolean | undefined;
}) {
  const undo = useRef<HTMLButtonElement>(null);
  const { from } = props;
  // The focus is moved once, when the row mounts as the undo row (the control it came from is gone by then). A layout
  // effect, so the focus is on the undo in the commit that removes that control, not a frame later.
  const [mountedWithUndo] = useState(() => props.onUndo !== undefined);
  useLayoutEffect(() => {
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    const caused = from?.current != null && active === from.current;
    if (mountedWithUndo && (lost || caused)) undo.current?.focus();
  }, [mountedWithUndo, from]);
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
            className={cn("px-2 font-semibold", props.compact && LINE_HIT)}
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
