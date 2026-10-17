import type { ExchangeDependencies, SwapSide } from "../types";

export interface SwapOverview {
  /** Requests for my offers (I am the giver), newest first. */
  readonly received: readonly SwapSide[];
  /** Requests I sent (I am the recipient), newest first. */
  readonly sent: readonly SwapSide[];
}

/**
 * My side of every swap (US-SOZ-10): both sides see the state. A swap whose friendship ended is canceled first (the lazy
 * check of ADR 0012), so the list never shows a living swap behind a dead friendship. Each account reads only its own
 * rows (P-04). Finished swaps stay (P-10); the history view follows with US-SOZ-13.
 */
export async function swapOverview(
  deps: Pick<ExchangeDependencies, "swaps">,
  userId: string,
): Promise<SwapOverview> {
  await deps.swaps.cancelOrphaned(userId);
  const mine = await deps.swaps.list(userId);
  return {
    received: mine.filter((s) => s.role === "giver"),
    sent: mine.filter((s) => s.role === "recipient"),
  };
}
