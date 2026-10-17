import { appError, defineOperation, failed, idField, ok, shape } from "../../../kernel";
import { titleOf } from "../../candidates";
import type { WishRow, WishStore } from "../../types";

export interface DiscardDependencies {
  readonly wishes: Pick<WishStore, "discard">;
}

/** What "Discarded" did and what comes next (P-09, P-10): the wish left the list but is kept under "Verworfen". */
export interface WishDiscardResult {
  readonly wish: WishRow;
  /** `false`: the wish was discarded already, nothing was written again. */
  readonly changed: boolean;
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const schema = shape({ wishId: idField("wishId") });

const ERROR = { not_found: "wish.not_found", not_open: "wish.already_bought" } as const;

function hintFor(wish: WishRow, changed: boolean): WishDiscardResult["hint"] {
  const title = titleOf(wish);
  return {
    text: changed
      ? `„${title}“ ist verworfen. Der Wunsch steht nicht mehr in der Wunschliste, bleibt aber unter „Verworfen“ gespeichert.`
      : `„${title}“ war schon verworfen; es wurde nichts geändert. Du findest ihn unter „Verworfen“.`,
    nextAction: "Prüfe die übrigen Kandidaten oder erfasse einen neuen Wunsch.",
  };
}

/**
 * Discards an open wish (US-WUN-05): `status = wishlist` becomes `discarded`. It leaves the candidate list (FR-WUN-02)
 * but stays stored and readable (`wishDiscarded`, P-10); nothing is deleted. Idempotent: a wish that is discarded
 * already is answered with `changed: false` and not written again. A bought wish is refused with
 * `wish.already_bought` and stays bought. A wish of another account looks like an unknown one: `wish.not_found` (P-04).
 */
export const wishDiscard = (deps: DiscardDependencies) =>
  defineOperation({
    name: "wish.discard",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.discard(userId, input.wishId);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      return ok<WishDiscardResult>({ ...r, hint: hintFor(r.wish, r.changed) });
    },
  });
