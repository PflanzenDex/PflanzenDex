import { appError, defineOperation, failed, idField, ok, shape } from "../../kernel";
import { SWAP_REQUEST_REFUSAL, type ExchangeDependencies } from "../exchange";
import type { MatchAnswers } from "./answer/types";

/** `requested`: the swap request exists now; `already_requested`: I already had an open request on this offer. */
export interface MatchYesResult {
  readonly outcome: "requested" | "already_requested";
  readonly swapId: string | null;
}

/**
 * "Yes" on a match card (US-TAU-03, P-03): the same request as in the exchange (US-SOZ-09, same checks, states and
 * limits, DM-SOZ-03), created through the same store; for the mode `swap` the return stays open and is completed in
 * "Requests". Nothing new is stored: the request is the record of the Yes (NFR-04). A second Yes on an offer that is
 * already requested is not an error but `already_requested`, so the card can say so and nothing is created twice. An offer
 * that is gone, no longer open, own or not shared with me is refused with the stable error of the exchange (P-10, P-05).
 * The giver gets the request like any other and nothing says it came from a card (US-SOZ-12). The same Idempotency-Key
 * replays the first answer (US-QS-03).
 */
export const matchYes = (deps: Pick<ExchangeDependencies, "swaps">, answers: MatchAnswers) =>
  defineOperation<{ offerId: string }, MatchYesResult>({
    name: "swap.match_yes",
    schema: shape({ offerId: idField("offerId") }),
    run: async ({ userId }, input) => {
      const r = await deps.swaps.request(userId, input.offerId, null, null);
      // The request is the record of the Yes (NFR-04): an earlier Later or No on this offer is replaced by it.
      if (r.outcome === "requested") {
        await answers.remove(userId, input.offerId);
        return ok({ outcome: "requested", swapId: r.swapId });
      }
      if (r.outcome === "already_requested") {
        await answers.remove(userId, input.offerId);
        return ok({ outcome: "already_requested", swapId: null });
      }
      return failed(appError(SWAP_REQUEST_REFUSAL[r.outcome]));
    },
  });
