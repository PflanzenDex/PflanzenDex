import type { ProvenanceSource } from "../../../collection";
import type { ExchangeDependencies, SwapSide } from "../types";

/** One finished swap as its owner sees it in the history (US-SOZ-13). */
export interface HistoryEntry {
  readonly swapId: string;
  /** The handover instant, else the last decision, else the request (ISO 8601). */
  readonly date: string;
  /** The friend's display name as stored at the request; `null` = none (P-08). It stays after the friendship ended. */
  readonly friend: string | null;
  /** `given`: I was the giver; `received`: I was the recipient. */
  readonly direction: "given" | "received";
  /** German name, else Latin, else `null` = unknown (P-08). */
  readonly species: string | null;
  readonly type: SwapSide["type"];
  readonly mode: SwapSide["mode"];
  readonly status: SwapSide["status"];
  readonly reason: string | null;
  readonly cause: SwapSide["cause"];
  /** The specimen given (giver) or received (recipient); `null` while there is none or it is gone. */
  readonly specimenId: string | null;
}

const FINISHED = new Set<SwapSide["status"]>(["handed_over", "declined", "canceled", "withdrawn"]);

const entry = (s: SwapSide): HistoryEntry => ({
  swapId: s.swapId,
  date: s.handedOverAt ?? s.decidedAt ?? s.requestedAt,
  friend: s.otherName,
  direction: s.role === "giver" ? "given" : "received",
  species: s.speciesGerman ?? s.speciesLatin,
  type: s.type,
  mode: s.mode,
  status: s.status,
  reason: s.reason,
  cause: s.cause,
  specimenId: s.role === "giver" ? s.givenSpecimenId : s.receivedSpecimenId,
});

/**
 * The swap history (US-SOZ-13): completed and ended swaps (handed over, declined, canceled, withdrawn) of the caller,
 * newest first, each with date, friend, given or received, species and status. The friend is the name stored at the
 * request, so the history survives the end of the friendship; a swap whose friendship ended is canceled first (the lazy
 * check of ADR 0012). Open swaps are not history, they are on the page of the requests. Each account reads only its own
 * rows (P-04); nothing disappears (P-10).
 */
export async function swapHistory(
  deps: Pick<ExchangeDependencies, "swaps">,
  userId: string,
): Promise<{ readonly entries: readonly HistoryEntry[] }> {
  await deps.swaps.cancelOrphaned(userId);
  const finished = (await deps.swaps.list(userId)).filter((s) => FINISHED.has(s.status)).map(entry);
  return {
    entries: finished.sort(
      (a, b) => b.date.localeCompare(a.date) || a.swapId.localeCompare(b.swapId),
    ),
  };
}

/** The port "Provenance per specimen" of the cards (`collection` defines it, US-SOZ-13): from whom a specimen was received. */
export const swapProvenance = (deps: Pick<ExchangeDependencies, "swaps">): ProvenanceSource => ({
  forSpecimens: (userId, specimenIds) => deps.swaps.provenanceFor(userId, specimenIds),
});
