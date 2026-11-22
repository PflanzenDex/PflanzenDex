import { useRef, useState } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import {
  appendKey,
  todayLocal,
  entityKey,
  useInvalidate,
  useWriteAction,
  type WriteOptions,
} from "../../../shared/data";
import { summaryDate } from "@/shared/lib/format";
import { madeEntries, markWatered, unwaterPlants } from "../../api/reminders-api";
import table from "./water-action.de.json";

const t = texts(table);

/** What the last answers said: whether the write made the entry, the day the server used, how many entries the undo removed. */
type Answer = { made: boolean; day: string | null; removed: number };

/** Writes today's entry of one plant and keeps what the answer says (the keeper's day, whether it made the entry). */
async function sendWater(
  to: { api: string; tok: string; specimenId: string },
  answer: { current: Answer },
  options: WriteOptions,
) {
  const r = await markWatered(to.api, to.tok, [to.specimenId], options);
  answer.current.made = r.ok && madeEntries(r.value, 1);
  answer.current.day = r.ok ? ((r.value as { date?: string }).date ?? null) : null;
  return r;
}

/** Takes the entry of `date` back and keeps how many were removed (0: nothing was left). */
async function sendUndo(
  to: { api: string; tok: string; specimenId: string; date: string },
  answer: { current: Answer },
  options: WriteOptions,
) {
  const { api, tok, specimenId, date } = to;
  const r = await unwaterPlants(api, tok, { specimenIds: [specimenId], date }, options);
  answer.current.removed = r.ok ? ((r.value as { removed?: number }).removed ?? 0) : 0;
  return r;
}

/**
 * "Gießen" of one plant with its undo (US-QS-32). A write that made the entry holds the plant's button in its place for the
 * undo window; a write without an entry (it was there already) says "Zuletzt gegossen: heute" in place and in the live
 * region, no toast (SG-FEED-01); `last` is that day. The undo takes the entry back through `monitoring.unwater`, for the day
 * the write used (its answer), and says so when nothing was left to remove. A refusal stays a toast (P-10).
 */
export function useWaterWrite(
  api: string,
  token: () => Promise<string | undefined>,
  specimen: { id: string; name: string },
) {
  const say = useSay();
  const [last, setLast] = useState<string | null>(null);
  const again = useInvalidate(["monitoring", "watering"]);
  const undo = useUndo<string>();
  const answer = useRef<Answer>({ made: false, day: null, removed: 0 });
  const write = useWriteAction(token, again, (message, kind) => {
    if (kind === "error") {
      say(message, kind);
      return;
    }
    if (answer.current.made) {
      const hold = { key: specimen.id, group: specimen.id, item: specimen.id };
      undo.hold([{ ...hold, index: 0, undoable: true }], t("resultToday"));
      return;
    }
    // The day the server used (its answer, the keeper's zone), so the line reads against the keeper's today (NFR-08).
    const day = answer.current.day ?? todayLocal();
    setLast(day);
    say(t("last", { when: summaryDate(day, todayLocal()) }));
  });
  const restore = useWriteAction(token, again, (message, kind) => {
    if (kind !== "error") undo.release(specimen.id);
    say(kind !== "error" && answer.current.removed === 0 ? t("nothingToUndo") : message, kind);
  });
  const water = () =>
    void write.run(
      (tok, opts) => sendWater({ api, tok, specimenId: specimen.id }, answer, opts),
      t("watered", { name: specimen.name }),
      // A daily append: the local day names the occasion, so a watering the next day is a write of its own (US-QS-03).
      appendKey("specimen", specimen.id, `water:${todayLocal()}`),
    );
  const undoWater = () => {
    const date = answer.current.day;
    if (date === null) return;
    void restore.run(
      (tok, opts) => sendUndo({ api, tok, specimenId: specimen.id, date }, answer, opts),
      t("restored"),
      entityKey("specimen", specimen.id, `unwater:${date}`),
    );
  };
  const held = undo.held.some((h) => h.key === specimen.id);
  return { held, last, write, restore, water, undoWater };
}
