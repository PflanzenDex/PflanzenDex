import { useRef, useState } from "react";
import type { PhasesRow } from "@pflanzendex/core";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import { useWriteAction } from "../../../shared/data";
import { restorePhaseLocations } from "../../shared/api/care-phases-api";
import { usePhaseSwitch } from "../use-phase-switch";
import table from "./care-phases-page.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/**
 * "Umstellen" with its bulk move held in place (US-PHA-03, SG-FEED-03, US-QS-32): a bulk move keeps its rows as they stood
 * before it for the undo window, and its group shows "Umgestellt · Rückgängig"; the undo gives each plant its own earlier
 * location back. A plant without a location before has none to go back to, so such a move is not held; neither is one
 * offline (its write waits in the buffer).
 */
export function useBulkMove(api: string, token: Token, again: () => void) {
  const undo = useUndo<PhasesRow>();
  const [note, setNote] = useState<string | null>(null);
  // The rows of the bulk move in flight; a single move holds nothing.
  const bulk = useRef<readonly PhasesRow[] | null>(null);
  const restoring = useRef<string | null>(null);
  const say = (message: string, kind?: "success" | "error") => {
    const before = bulk.current;
    bulk.current = null;
    // A refusal is the alert of the page (P-10); only a success is held or said here.
    if (kind === "error") return;
    if (before && before.length > 0) {
      const group = before[0]?.targetLocationId ?? "";
      undo.hold(
        before.map((item, index) => ({ key: item.specimenId, group, item, index, undoable: true })),
        ui("movedResult"),
        message,
      );
      return;
    }
    setNote(message);
  };
  const move = usePhaseSwitch(api, token, again, say);
  const restore = useWriteAction(token, again, (message, kind) => {
    if (kind === "error") return;
    if (restoring.current !== null) undo.release(restoring.current);
    restoring.current = null;
    setNote(message);
  });
  const confirm = (ids: readonly string[], text: string, before?: readonly PhasesRow[]) => {
    const undoable =
      before !== undefined && isOnline() && before.every((row) => row.locationId !== null);
    bulk.current = undoable ? before : null;
    void move.confirm(ids, text);
  };
  const undoGroup = (group: string) => {
    const moves = undo.held.flatMap((h) =>
      h.group === group && h.item.locationId !== null
        ? [{ specimenId: h.item.specimenId, locationId: h.item.locationId }]
        : [],
    );
    restoring.current = group;
    void restore.run((t) => restorePhaseLocations(api, t, moves), ui("restored"));
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
