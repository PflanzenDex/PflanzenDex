import type { DecideResult } from "@pflanzendex/core";
import { useRef, useState } from "react";
import { errorText } from "@/shared/lib/error-text";
import type { SwipeDirection } from "@/shared/patterns/elements/swipe-card/swipe-gesture";
import type { Response } from "../../shared/data";

/** What the keeper decided on a card (US-ENT-04): "Ja" and "Nein" are written at once, "Später" writes nothing. */
export type Decision = "no" | "later" | "yes";

export type OnDecide = (species: string, decision: "yes" | "no") => Promise<Response<DecideResult>>;

/** What a decision does: "Later" writes nothing, and only a saved "Yes" counts (US-ENT-04). */
const EFFECT: Record<Decision, { write: "yes" | "no" | null; counts: boolean }> = {
  no: { write: "no", counts: false },
  later: { write: null, counts: false },
  yes: { write: "yes", counts: true },
};

/**
 * Writes "Ja" and "Nein" (US-ENT-04) and moves on only after the write succeeded; a refusal stays visible and the card
 * stays (P-10). `exit` is the flight of the card while its decision is written: it ends with the write, so a refusal
 * brings the card back and a success lets the next card take its place. Counts the saved "Ja" of this deck, not the
 * taps. One write at a time.
 */
export function useDecisions(onDecide: OnDecide, advance: () => void) {
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<SwipeDirection | null>(null);
  const busy = useRef(false);
  const decide = async (species: string, d: Decision) => {
    if (busy.current) return;
    const { write, counts } = EFFECT[d];
    if (write === null) {
      setError(null);
      setExit(null);
      advance();
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
    if (counts && r.value.saved) setSaved((n) => n + 1);
    setExit(null);
    advance();
  };
  return { saved, error, decide, exit, setExit };
}
