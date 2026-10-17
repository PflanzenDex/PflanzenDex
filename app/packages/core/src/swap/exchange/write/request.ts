import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
  type ErrorCode,
} from "../../../kernel";
import { OFFER_LIMITS } from "../../offer";
import type { ExchangeDependencies, RequestOutcome } from "../types";

const REFUSAL: Record<Exclude<RequestOutcome, "requested">, ErrorCode> = {
  offer_unknown: "offer.not_found",
  own_offer: "swap.own_offer",
  not_open: "offer.not_active",
  already_requested: "swap.already_requested",
  counter_not_allowed: "swap.counter_not_allowed",
  counter_unknown: "specimen.not_found",
  counter_not_shared: "swap.counter_not_shared",
};

interface Input {
  offerId: string;
  counterSpecimenId: string | null;
  counterText: string | null;
}

/**
 * Requests an open offer of a friend (US-SOZ-09, P-03): a swap with both sides is created in one step. For the mode `swap`
 * the requester may attach one own specimen with `Share = friends` as the counter-offer and/or free text, or leave the
 * return open; for a gift there is nothing to attach. Only one open request per offer from me; an offer of mine cannot be
 * requested; an offer that is not an open, shared offer of a confirmed friend (also a foreign or unknown id) is
 * `offer.not_found`, so nothing is revealed (P-04, P-05). The same Idempotency-Key replays the first answer (US-QS-03).
 * The wishlist is never transmitted (FR-WUN-07). Nothing is written on a refusal.
 */
export const swapRequest = (deps: Pick<ExchangeDependencies, "swaps">) =>
  defineOperation<Input, { readonly swapId: string }>({
    name: "swap.request",
    schema: shape({
      offerId: idField("offerId"),
      counterSpecimenId: orNull(idField("counterSpecimenId")),
      counterText: orNull(textField("counterText", OFFER_LIMITS.note)),
    }),
    run: async ({ userId }, input) => {
      const r = await deps.swaps.request(
        userId,
        input.offerId,
        input.counterSpecimenId,
        input.counterText,
      );
      if (r.outcome === "requested" && r.swapId) return ok({ swapId: r.swapId });
      return failed(appError(REFUSAL[r.outcome === "requested" ? "offer_unknown" : r.outcome]));
    },
  });
