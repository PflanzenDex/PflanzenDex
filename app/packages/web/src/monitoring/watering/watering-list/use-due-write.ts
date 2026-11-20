import { useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { useUndo, type Held, type Undo } from "@/shared/feedback/undo-row/use-undo";
import { texts } from "@/shared/lib/text-rules/texts";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { WATERING_KEY } from "../../api/due-count/due-count";
import { markWatered, unwaterPlants, type WateringDueRow } from "../../api/reminders-api";
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

/** Only entries this write made can be taken back: a plant that was entered earlier today keeps its entry (US-QS-32). */
const madeAll = (value: unknown, count: number): boolean =>
  (value as { created?: unknown } | null)?.created === count;

/** Holds the rows of a write that made its entries: one plant, or one bulk write whose undo sits below the list (US-QS-32). */
function holdWritten(
  hold: Undo<WateringDueRow>["hold"],
  p: { entries: readonly WaterEntry[]; bulk: boolean },
  group: string,
): void {
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

/**
 * The write of the sheet "Gegossen" with its undo in place (SG-FEED-03, US-QS-32): a write that made the entries holds
 * their rows (one plant: its row carries the undo; several: one undo below the list), otherwise its result is the line
 * above the list. A refusal is the alert below (P-10).
 */
export function useDueWrite(api: string, token: () => Promise<string | undefined>) {
  const again = useInvalidate(WATERING_KEY);
  const announce = useAnnounce();
  const undo = useUndo<WateringDueRow>();
  const [result, setResult] = useState<string | null>(null);
  const pending = useRef<{ entries: readonly WaterEntry[]; bulk: boolean } | null>(null);
  const made = useRef(false);
  const groups = useRef(0);
  const restoring = useRef<string | null>(null);
  const write = useWriteAction(token, again, (message, kind) => {
    if (kind === "error") return;
    const p = pending.current;
    pending.current = null;
    if (p && made.current) {
      holdWritten(
        undo.hold,
        p,
        p.bulk ? `bulk:${++groups.current}` : `plant:${p.entries[0]?.row.specimenId}`,
      );
      return;
    }
    setResult(message);
    announce?.announce(message);
  });
  const restore = useWriteAction(token, again, (message, kind) => {
    if (kind === "error") return;
    if (restoring.current !== null) undo.release(restoring.current);
    restoring.current = null;
    announce?.announce(message);
  });
  const water = (entries: readonly WaterEntry[]) => {
    setResult(null);
    pending.current = { entries, bulk: entries.length > 1 };
    void write.run(async (tok) => {
      const r = await markWatered(
        api,
        tok,
        entries.map((e) => e.row.specimenId),
      );
      made.current = r.ok && madeAll(r.value, entries.length);
      return r;
    }, ui("done"));
  };
  const undoPlant = (group: string) => {
    const ids = undo.held.filter((h) => h.group === group).map((h) => h.key);
    restoring.current = group;
    void restore.run((tok) => unwaterPlants(api, tok, ids), ui("restored"));
  };
  const bulk = bulkOf(undo.held, undoPlant);
  return {
    result,
    held: undo.held,
    bulk,
    water,
    undoPlant,
    running: write.running || restore.running,
    failure: write.error ?? restore.error,
  };
}
