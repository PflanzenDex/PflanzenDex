import { useRef } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { useSay, useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { madeEntries, markWatered, unwaterPlants } from "../../api/reminders-api";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * "Gießen" of one plant with its undo (US-QS-32). A write that made the entry holds the plant's button in its place for the
 * undo window; a write without an entry answers with a toast. The undo takes the entry back through `monitoring.unwater`,
 * for the day the write used (its answer), and says so when nothing was left to remove.
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
  const made = useRef(false);
  const writtenOn = useRef<string | null>(null);
  const removed = useRef(0);
  const write = useWriteAction(token, again, (message, kind) => {
    if (kind === "error" || !made.current) {
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
    say(kind !== "error" && removed.current === 0 ? t("nothingToUndo") : message, kind);
  });
  const water = () =>
    void write.run(
      async (tok, opts) => {
        const r = await markWatered(api, tok, [specimen.id], opts);
        made.current = r.ok && madeEntries(r.value, 1);
        writtenOn.current =
          r.ok && made.current ? ((r.value as { date?: string }).date ?? null) : null;
        return r;
      },
      t("watered", { name: specimen.name }),
    );
  const undoWater = () => {
    const date = writtenOn.current;
    if (date === null) return;
    void restore.run(async (tok, opts) => {
      const r = await unwaterPlants(api, tok, { specimenIds: [specimen.id], date }, opts);
      removed.current = r.ok ? ((r.value as { removed?: number }).removed ?? 0) : 0;
      return r;
    }, t("restored"));
  };
  return { held: undo.held.some((h) => h.key === specimen.id), write, restore, water, undoWater };
}
