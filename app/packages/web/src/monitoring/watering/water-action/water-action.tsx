import { useRef } from "react";
import { Button } from "@/shared/ui/button/button";
import { BUSY_LOOK } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { useReturnFocus } from "@/shared/feedback/undo-row/use-undo";
import { useWaterWrite } from "./use-water-write";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * "Gießen" for one plant (US-MON-05, US-QS-32): writes today's entry through the same operation as the list on "Heute".
 * When the write made the entry, the button turns into "Gegossen heute · Rückgängig" in its place for 8 s (SG-FEED-03).
 * Focus: while the write runs the button is `aria-disabled`, not `disabled` (F-0094); the undo row takes the focus when it
 * appears, and the button takes it back when the undo window ends or the undo ran.
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
}) {
  const { api, token, specimen } = props;
  const { held, write, restore, water, undoWater } = useWaterWrite(api, token, specimen);
  const button = useRef<HTMLButtonElement>(null);
  useReturnFocus(held, button);
  if (held)
    return (
      <UndoRow
        result={t("resultToday")}
        subject={specimen.name}
        busy={restore.running}
        onUndo={undoWater}
      />
    );
  return (
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
  );
}
