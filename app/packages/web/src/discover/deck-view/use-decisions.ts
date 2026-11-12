import type { DecideResult, UndoDecisionResult } from "@pflanzendex/core";
import { useRef, useState } from "react";
import { errorText } from "@/shared/lib/error-text";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Response } from "../../shared/data";
import table from "../discover.de.json";

const t = texts(table);

/** What the keeper decided on a card (US-ENT-04): "Ja" and "Nein" are written at once, "Später" writes nothing. */
export type Decision = "no" | "later" | "yes";

export type OnDecide = (species: string, decision: "yes" | "no") => Promise<Response<DecideResult>>;
export type OnUndo = (species: string) => Promise<Response<UndoDecisionResult>>;

/** The card the keeper decided last with "Ja" or "Nein" and that "Rückgängig" can still take back (US-ENT-04). */
export interface Taken {
  readonly species: string;
  readonly decision: "yes" | "no";
  /** A saved "Ja" that the count of this deck includes; taking it back takes it out again. */
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

/** The side a card left by its decision, so "Rückgängig" brings it back from there (US-ENT-10). */
const SIDE = { yes: "right", no: "left" } as const satisfies Record<"yes" | "no", SwipeDirection>;

/**
 * Writes "Ja" and "Nein" (US-ENT-04) and moves on only after the write succeeded; a refusal stays visible and the card
 * stays (P-10). `exit` is the flight of the card while its decision is written: it ends with the write, so a refusal
 * brings the card back and a success lets the next card take its place. Counts the saved "Ja" of this deck, not the
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
      setError(errorText(r.error.code));
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
      setError(errorText(r.error.code));
      return;
    }
    setError(null);
    announce?.(RESULT.undone);
    if (taken.counted) setSaved((n) => n - 1);
    setReturned(SIDE[taken.decision]);
    moves.back();
  };
  return { saved, error, decide, undo, taken, exit, setExit, returned };
}
