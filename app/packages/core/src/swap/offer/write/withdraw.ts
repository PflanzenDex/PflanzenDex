import { appError, defineOperation, failed, idField, ok, shape } from "../../../kernel";
import type { OfferDependencies, OfferRow } from "../types";

/**
 * Withdraws an offer (US-SOZ-08, P-03): possible at any time while it is open or reserved. Open requests for it are
 * canceled by the swap process once it exists (US-SOZ-09, US-SOZ-10); until then there are none. Withdrawing twice
 * changes nothing; an offer that is unknown or belongs to someone else is `offer.not_found` (P-04); a handed-over offer is
 * `offer.not_active` (nothing disappears silently, P-10).
 */
export const offerWithdraw = (deps: Pick<OfferDependencies, "offers">) =>
  defineOperation<{ offerId: string }, OfferRow>({
    name: "offer.withdraw",
    schema: shape({ offerId: idField("offerId") }),
    run: async ({ userId }, input) => {
      const r = await deps.offers.withdraw(userId, input.offerId);
      if (r === "not_found") return failed(appError("offer.not_found"));
      return r === "not_active" ? failed(appError("offer.not_active")) : ok(r);
    },
  });
