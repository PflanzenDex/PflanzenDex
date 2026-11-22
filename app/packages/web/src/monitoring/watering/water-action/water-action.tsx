import { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui/button/button";
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
 * The button stays where it is and unchanged, so nothing under the finger moves (SG-FEED-05, issue 2462). The result is
 * drawn into `resultHost`, a line of the overview that gives its place to it: when the write made the entry,
 * "Gegossen heute · Rückgängig" for 8 s (SG-FEED-03), otherwise "Zuletzt gegossen: heute" until the next write; it reads
 * against the keeper's today when it renders, so the word follows the day. Without a host the result stands next to the
 * button. Focus: while the write runs the button is `aria-disabled`, not `disabled` (F-0094); the undo takes the focus when
 * it appears, and the button takes it back when the undo window ends or the undo ran.
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
  /** The line whose place the result takes (`SlotContext.resultHost` of the plant layer). */
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
