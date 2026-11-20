import { useRef } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { useSay, useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { markWatered, unwaterPlants } from "../../api/reminders-api";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * Only the entry this write made may be taken back: a repeat on a day that already has one creates nothing, and an undo
 * then would remove the earlier entry (US-QS-32).
 */
const madeTodaysEntry = (value: unknown): boolean =>
  (value as { created?: unknown } | null)?.created === 1;

/**
 * "Gießen" of one plant with its undo (US-QS-32). A write that made the entry holds the plant's button in its place for the
 * undo window; a write without an entry answers with a toast. The undo takes the entry back through `monitoring.unwater`.
 */
export function useWaterWrite(
  api: string,
  token: () => Promise<string | undefined>,
  specimen: { id: string; name: string },
) {
  const toast = useToast();
  const say = useSay();
  const again = useInvalidate(["monitoring", "watering"]);
  const undo = useUndo<string>();
  const created = useRef(false);
  const write = useWriteAction(token, again, (message, kind) => {
    if (kind === "error" || !created.current) {
      toast.show(kind ? { message, kind } : { message });
      return;
    }
    undo.hold(
      [{ key: specimen.id, group: specimen.id, item: specimen.id, index: 0, undoable: true }],
      t("resultToday"),
    );
  });
  const restore = useWriteAction(token, again, (message, kind) => {
    if (kind !== "error") undo.release(specimen.id);
    say(message, kind);
  });
  const water = () =>
    void write.run(
      async (tok) => {
        const r = await markWatered(api, tok, [specimen.id]);
        created.current = r.ok && madeTodaysEntry(r.value);
        return r;
      },
      t("watered", { name: specimen.name }),
    );
  const undoWater = () =>
    void restore.run((tok) => unwaterPlants(api, tok, [specimen.id]), t("restored"));
  return { held: undo.held.some((h) => h.key === specimen.id), write, restore, water, undoWater };
}
