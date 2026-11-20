import { useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import { useUndo, type Held, type Undo } from "@/shared/feedback/undo-row/use-undo";
import { texts } from "@/shared/lib/text-rules/texts";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { WATERING_KEY } from "../../api/due-count/due-count";
import {
  madeEntries,
  markWatered,
  unwaterPlants,
  type WateringDueRow,
} from "../../api/reminders-api";
import table from "./watering-list.de.json";

const ui = texts(table);

/** A plant of one write with the place it stood in (it is shown there until the undo window ends). */
export interface WaterEntry {
  readonly row: WateringDueRow;
  readonly index: number;
}

/** The undo of a bulk write, shown below the list where its button was (US-QS-32). */
export interface BulkUndo {
  readonly result: string;
  readonly subject: string;
  readonly onUndo: () => void;
}

const dateOf = (value: unknown): string | null => (value as { date?: string } | null)?.date ?? null;
const removedOf = (value: unknown): number => (value as { removed?: number } | null)?.removed ?? 0;

/** The undo of the latest bulk write of the list, if one is held (US-QS-32). */
function bulkOf(
  held: readonly Held<WateringDueRow>[],
  undoPlant: (group: string) => void,
): BulkUndo | null {
  const group = [...held].reverse().find((h) => h.group.startsWith("bulk:"))?.group;
  if (group === undefined) return null;
  const count = held.filter((h) => h.group === group).length;
  return {
    result: ui("bulkResult", { count }),
    subject: ui("bulkSubject", { count }),
    onUndo: () => undoPlant(group),
  };
}

/** Holds the rows of a write that made its entries: one plant, or one bulk write whose undo sits below the list (US-QS-32). */
function holdWritten(
  hold: Undo<WateringDueRow>["hold"],
  p: { entries: readonly WaterEntry[]; bulk: boolean },
  group: string,
) {
  hold(
    p.entries.map(({ row, index }) => ({
      key: row.specimenId,
      group,
      item: row,
      index,
      undoable: !p.bulk,
    })),
    ui("wateredResult"),
    p.bulk ? ui("bulkSaid", { count: p.entries.length }) : undefined,
  );
}

/** The write of the entries; `made` keeps the day of a write that made every entry, for its undo (US-QS-32). */
async function sendWater(
  api: string,
  tok: string,
  entries: readonly WaterEntry[],
  made: { current: { date: string } | null },
) {
  const r = await markWatered(
    api,
    tok,
    entries.map((e) => e.row.specimenId),
  );
  const date = r.ok && madeEntries(r.value, entries.length) ? dateOf(r.value) : null;
  made.current = date === null ? null : { date };
  return r;
}

/** The undo of one day: `removed` keeps how many entries were taken back (0: nothing was left, US-QS-32). */
async function sendUndo(
  api: string,
  tok: string,
  input: { specimenIds: readonly string[]; date: string },
  removed: { current: number },
) {
  const r = await unwaterPlants(api, tok, input);
  removed.current = r.ok ? removedOf(r.value) : 0;
  return r;
}

/**
 * The write of the sheet "Gegossen" with its undo in place (SG-FEED-03, US-QS-32): a write that made the entries holds their
 * rows (one plant: its row carries the undo; several: one undo below the list), otherwise its result is the line above the
 * list. A tap while a write runs is ignored, so the hold belongs to the write that was started. The undo takes the entries
 * of the day the write used (its answer) and says so when nothing was left to remove. A refusal is the alert below.
 */
export function useDueWrite(api: string, token: () => Promise<string | undefined>) {
  const again = useInvalidate(WATERING_KEY);
  const announce = useAnnounce();
  const undo = useUndo<WateringDueRow>();
  const [result, setResult] = useState<string | null>(null);
  const pending = useRef<{ entries: readonly WaterEntry[]; bulk: boolean } | null>(null);
  const made = useRef<{ date: string } | null>(null);
  const removed = useRef(0);
  const groups = useRef(0);
  const restoring = useRef<string | null>(null);
  const dates = useRef(new Map<string, string>());
  const write = useWriteAction(token, again, (message, kind) => {
    const p = pending.current;
    pending.current = null;
    if (kind === "error") return;
    if (p && made.current) {
      const group = p.bulk ? `bulk:${++groups.current}` : `plant:${p.entries[0]?.row.specimenId}`;
      dates.current.set(group, made.current.date);
      holdWritten(undo.hold, p, group);
      return;
    }
    setResult(message);
    announce?.announce(message);
  });
  const restore = useWriteAction(token, again, (message, kind) => {
    const group = restoring.current;
    restoring.current = null;
    if (kind === "error") return;
    if (group !== null) undo.release(group);
    announce?.announce(removed.current === 0 ? ui("nothingToUndo") : message);
  });
  const water = (entries: readonly WaterEntry[]) => {
    if (pending.current !== null || restoring.current !== null) return;
    setResult(null);
    if (isOnline()) pending.current = { entries, bulk: entries.length > 1 };
    void write.run((tok) => sendWater(api, tok, entries, made), ui("done"));
  };
  const undoPlant = (group: string) => {
    const date = dates.current.get(group);
    if (date === undefined || pending.current !== null || restoring.current !== null) return;
    const specimenIds = undo.held.filter((h) => h.group === group).map((h) => h.key);
    restoring.current = group;
    void restore.run((tok) => sendUndo(api, tok, { specimenIds, date }, removed), ui("restored"));
  };
  return {
    result,
    held: undo.held,
    bulk: bulkOf(undo.held, undoPlant),
    water,
    undoPlant,
    running: write.running || restore.running,
    failure: write.error ?? restore.error,
  };
}
