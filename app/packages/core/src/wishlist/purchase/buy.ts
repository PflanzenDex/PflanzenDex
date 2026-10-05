import { appError, defineOperation, failed, idField, ok, shape } from "../../kernel";
import { titleOf } from "../candidates";
import type { WishRow, WishStore } from "../types";

export interface BuyWishDependencies {
  readonly wishes: Pick<WishStore, "buy">;
}

/** What "Bought" did and what comes next (P-09, P-10): the wish left the list but is kept under "Gekauft". */
export interface WishBuyResult {
  readonly wish: WishRow;
  /** `false`: the wish was bought already, nothing was written again. */
  readonly changed: boolean;
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const schema = shape({ wishId: idField("wishId") });

const ERROR = { not_found: "wish.not_found", not_open: "wish.not_open" } as const;

// The guided path from purchase to plant (species preselected, link wish -> specimen) is US-WUN-05; until then the
// next action names the specimen in words only.
const NEXT_ACTION =
  "Lege die Pflanze jetzt als Exemplar in deiner Sammlung an, damit sie in ihrer Lichtzone mitzählt.";

function hintFor(wish: WishRow, changed: boolean): WishBuyResult["hint"] {
  const title = titleOf(wish);
  return {
    text: changed
      ? `„${title}“ ist als gekauft vermerkt. Der Wunsch steht nicht mehr in der Wunschliste, sondern unter „Gekauft“.`
      : `„${title}“ war schon als gekauft vermerkt; es wurde nichts geändert. Du findest ihn unter „Gekauft“.`,
    nextAction: NEXT_ACTION,
  };
}

/**
 * Records a purchase (US-WUN-03): an open wish (`status = wishlist`) becomes `bought`. It leaves the candidate list
 * (FR-WUN-02) but stays stored and readable in the history (`wishBought`, P-10); nothing is deleted. Idempotent: a
 * wish that is bought already is answered with `changed: false` and not written again; the same Idempotency-Key
 * replays the first answer (US-QS-03). Only an open wish can be bought: a discarded one is refused with
 * `wish.not_open` and stays discarded. A wish of another account looks like an unknown one: `wish.not_found` (P-04).
 */
export const wishBuy = (deps: BuyWishDependencies) =>
  defineOperation({
    name: "wish.buy",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.buy(userId, input.wishId);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      return ok<WishBuyResult>({ ...r, hint: hintFor(r.wish, r.changed) });
    },
  });
