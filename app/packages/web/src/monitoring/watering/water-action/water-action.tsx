import { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui/button";
import { BUSY_LOOK } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { summaryDate } from "@/shared/lib/format";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { useReturnFocus } from "@/shared/feedback/undo-row/use-undo";
import { todayLocal } from "../../../shared/data";
import { useWaterWrite } from "./use-water-write";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * "Gießen" for one plant (US-MON-05, US-QS-32): writes today's entry through the same operation as the list on "Heute".
 * The button stays where it is and unchanged, so nothing under the finger moves (SG-FEED-05, issues 2462, 2536). The result
 * is drawn into `resultHost`, the line directly below the quick actions of the layer (owner decision d-130, issue 2536):
 * when the write made the entry, "Gegossen heute · Rückgängig" for 8 s (SG-FEED-03), otherwise "Zuletzt gegossen: heute"
 * until the next write; it reads against the keeper's today when it renders, so the word follows the day. Without a host
 * the result stands next to the button. Focus: while the write runs the button is `aria-disabled`, not `disabled` (F-0094);
 * the focus stays on the button when the result shows in the host, because the undo row takes none there (`keepFocus`: the
 * view must not scroll away from the row, US-QS-15); without a host the undo takes the focus from the button, as before
 * (`from`). The result is said once, by the shared live region (`useUndo`, `useSay`, SG-FEED-04). A keeper who tabbed to the
 * undo and used it, or whose window ended under the focus, gets the focus back on the button.
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
  /** The line directly below the quick actions that holds the result (`SlotContext.resultHost` of the plant layer). */
  resultHost?: HTMLElement | null | undefined;
}) {
  const { api, token, specimen, resultHost } = props;
  const { held, last, write, restore, water, undoWater } = useWaterWrite(api, token, specimen);
  const button = useRef<HTMLButtonElement>(null);
  useReturnFocus(held, button);
  let result = null;
  if (held)
    result = (
      <UndoRow
        result={t("resultToday")}
        subject={specimen.name}
        busy={restore.running}
        from={button}
        keepFocus={resultHost != null}
        compact={resultHost != null}
        onUndo={undoWater}
      />
    );
  else if (last)
    result = <p className="text-sm">{t("last", { when: summaryDate(last, todayLocal()) })}</p>;
  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="tinted"
        aria-disabled={write.running || undefined}
        className={BUSY_LOOK}
        aria-label={t("label", { name: specimen.name })}
        onClick={water}
      >
        {t("action")}
      </Button>
      {result && resultHost ? createPortal(result, resultHost) : result}
    </>
  );
}
