import { useRef, useState } from "react";
import type { PhasesRow } from "@pflanzendex/core";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import { accountKey, useWriteAction } from "../../../shared/data";
import { restorePhaseLocations } from "../../shared/api/care-phases-api";
import { usePhaseSwitch } from "../use-phase-switch";
import table from "./care-phases-page.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/** The locations to set back: every plant of the group, its own earlier location (US-QS-32). */
const movesOf = (held: readonly { group: string; item: PhasesRow }[], group: string) =>
  held.flatMap((h) =>
    h.group === group && h.item.locationId !== null
      ? [{ specimenId: h.item.specimenId, locationId: h.item.locationId }]
      : [],
  );

/**
 * "Umstellen" with its bulk move held in place (US-PHA-03, SG-FEED-03, US-QS-32): a bulk move keeps its rows as they stood
 * before it for the undo window, and its group shows "Umgestellt · Rückgängig"; the undo gives each plant its own earlier
 * location back. A plant without a location before has none to go back to, so such a move is not held; neither is one
 * offline. A move starts only when no other move runs. A failed undo releases its rows, so the list shows the reloaded state
 * and the refusal stays on the page.
 */
export function useBulkMove(api: string, token: Token, again: () => void) {
  const undo = useUndo<PhasesRow>();
  const [note, setNote] = useState<string | null>(null);
  // The rows of the bulk move in flight; a single move holds nothing.
  const bulk = useRef<readonly PhasesRow[] | null>(null);
  const writing = useRef(false);
  const restoring = useRef<string | null>(null);
  const say = (message: string, kind?: "success" | "error") => {
    const before = bulk.current;
    bulk.current = null;
    writing.current = false;
    // A refusal is the alert of the page (P-10); a note that stood before it is gone.
    if (kind === "error") return setNote(null);
    if (!before || before.length === 0) return setNote(message);
    const group = before[0]?.targetLocationId ?? "";
    const entries = before.map((item, index) => ({
      key: item.specimenId,
      group,
      item,
      index,
      undoable: true,
    }));
    undo.hold(entries, ui("movedResult"), message);
  };
  const move = usePhaseSwitch(api, token, again, say);
  const restore = useWriteAction(token, again, (message, kind) => {
    const group = restoring.current;
    restoring.current = null;
    if (group !== null) undo.release(group);
    if (kind !== "error") setNote(message);
  });
  const confirm = (ids: readonly string[], text: string, before?: readonly PhasesRow[]) => {
    if (writing.current) return;
    setNote(null);
    const online = isOnline();
    const undoable = before !== undefined && online && before.every((r) => r.locationId !== null);
    bulk.current = undoable ? before : null;
    if (online) writing.current = true;
    void move.confirm(ids, text);
  };
  const undoGroup = (group: string) => {
    const moves = movesOf(undo.held, group);
    restoring.current = group;
    setNote(null);
    // The undo names the plants and their earlier places (ids, not content): the same undo repeats the same key, and
    // `restorePhaseLocations` derives one key per plant from it (US-QS-03, US-QS-32).
    const key = accountKey(`undo:${moves.map((m) => `${m.specimenId}>${m.locationId}`).join(",")}`);
    void restore.run((t, opts) => restorePhaseLocations(api, t, moves, opts), ui("restored"), key);
  };
  const groupUndo = (target: string) =>
    undo.held.some((h) => h.group === target)
      ? { busy: restore.running, onUndo: () => undoGroup(target) }
      : undefined;
  const snapshot = new Map(undo.held.map((h) => [h.key, h.item] as const));
  return {
    note,
    move,
    restore,
    confirm,
    groupUndo,
    snapshot,
    busy: move.running || restore.running,
  };
}
