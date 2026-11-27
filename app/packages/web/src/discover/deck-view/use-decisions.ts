import type { DecideResult, UndoDecisionResult } from "@pflanzendex/core";
import { useRef, useState } from "react";
import { refusalText } from "@/shared/lib/error-text";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { useOnline } from "@/shared/platform/browser/network";
import { offlineReason } from "@/shared/ui/button.network-gate";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Response } from "../../shared/data";
import table from "../discover.de.json";

const t = texts(table);

/** What the keeper decided on a card (US-ENT-04): "Wünschen" and "Kein Interesse" are written at once, "Später" writes nothing. */
export type Decision = "no" | "later" | "yes";

export type OnDecide = (species: string, decision: "yes" | "no") => Promise<Response<DecideResult>>;
export type OnUndo = (species: string) => Promise<Response<UndoDecisionResult>>;

/** The card the keeper decided last with "Wünschen" or "Kein Interesse" and that "Rückgängig" can still take back (US-ENT-04). */
export interface Taken {
  readonly species: string;
  readonly decision: "yes" | "no";
  /** A saved "Wünschen" that the count of this deck includes; taking it back takes it out again. */
  readonly counted: boolean;
}

/** The moves of the deck: on to the next card, or back to the card a decision was taken back for. */
export interface Moves {
  readonly advance: () => void;
  readonly back: () => void;
}

/** What a decision does: "Later" writes nothing, and only a saved "Yes" counts (US-ENT-04). */
const EFFECT: Record<Decision, { write: "yes" | "no" | null; counts: boolean }> = {
  no: { write: "no", counts: false },
  later: { write: null, counts: false },
  yes: { write: "yes", counts: true },
};

/** What a screen reader hears after each decision and after "Rückgängig" (US-QS-10, US-ENT-10). */
const RESULT = {
  no: t("deck.result.no"),
  later: t("deck.result.later"),
  yes: t("deck.result.yes"),
  undone: t("deck.result.undone"),
} as const;

/** The directions whose decision writes nothing: "Später" (up and down). */
const WRITES_NOTHING: ReadonlySet<SwipeDirection> = new Set<SwipeDirection>(["up", "down"]);

/** The side a card left by its decision, so "Rückgängig" brings it back from there (US-ENT-10). */
const SIDE = { yes: "right", no: "left" } as const satisfies Record<"yes" | "no", SwipeDirection>;

/**
 * Writes "Wünschen" and "Kein Interesse" (US-ENT-04) and moves on only after the write succeeded; a refusal stays visible and the card
 * stays (P-10). `exit` is the flight of the card while its decision is written: it ends with the write, so a refusal
 * brings the card back and a success lets the next card take its place. Counts the saved "Wünschen" of this deck, not the
 * taps. "Rückgängig" (`undo`) takes back the last decision that wrote something and moves back to its card; any other
 * decision ends that possibility, because only the last Yes or No is taken back. One write at a time. `returned` is the
 * side the card taken back comes in from; each result is told to a screen reader.
 */
export function useDecisions(onDecide: OnDecide, onUndo: OnUndo, moves: Moves) {
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<SwipeDirection | null>(null);
  const [taken, setTaken] = useState<Taken | null>(null);
  const [returned, setReturned] = useState<SwipeDirection | null>(null);
  const busy = useRef(false);
  const announce = useAnnounce()?.announce;
  const decide = async (species: string, d: Decision) => {
    if (busy.current) return;
    const { write, counts } = EFFECT[d];
    setReturned(null);
    if (write === null) {
      announce?.(RESULT.later);
      setError(null);
      setExit(null);
      setTaken(null);
      moves.advance();
      return;
    }
    busy.current = true;
    const r = await onDecide(species, write);
    busy.current = false;
    if (!r.ok) {
      setExit(null);
      // A request without an answer carries its own German text (`network.not_reachable`, issue 1884).
      setError(refusalText(r.error));
      return;
    }
    setError(null);
    announce?.(RESULT[d]);
    const counted = counts && r.value.saved;
    if (counted) setSaved((n) => n + 1);
    // A repeat writes nothing on the server, so it leaves nothing to take back on the screen either.
    setTaken(r.value.saved ? { species, decision: write, counted } : null);
    setExit(null);
    moves.advance();
  };
  const undo = async () => {
    if (busy.current || exit !== null || taken === null) return;
    busy.current = true;
    const r = await onUndo(taken.species);
    busy.current = false;
    setTaken(null);
    if (!r.ok) {
      setError(refusalText(r.error));
      return;
    }
    setError(null);
    announce?.(RESULT.undone);
    if (taken.counted) setSaved((n) => n - 1);
    setReturned(SIDE[taken.decision]);
    moves.back();
  };
  const { fly, takeBack } = useDeckGate(exit, setExit, undo, announce);
  return { saved, error, decide, undo, taken, exit, setExit, returned, fly, takeBack };
}

/**
 * The network gate of the deck (US-ENT-04, US-QS-30): "Wünschen" and "Kein Interesse" write at once, so offline a swipe, a key or a button
 * does nothing and the reason is said; "Später" writes nothing (DECISION in deck-view: up and down) and stays open offline.
 * "Rückgängig" writes the take-back, so it needs the network too.
 */
function useDeckGate(
  exit: SwipeDirection | null,
  setExit: (d: SwipeDirection) => void,
  undo: () => Promise<void>,
  announce: ((text: string) => void) | undefined,
) {
  const online = useOnline();
  const fly = (d: SwipeDirection) => {
    if (exit !== null) return;
    if (!online && !WRITES_NOTHING.has(d)) {
      announce?.(offlineReason);
      return;
    }
    setExit(d);
  };
  const takeBack = () => {
    if (online) void undo();
    else announce?.(offlineReason);
  };
  return { fly, takeBack };
}
