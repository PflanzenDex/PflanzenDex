// Undo (US-ENT-04): takes the last Yes or No of the Discover deck back. The wish that decision created is
// removed and nothing else is touched (P-03, P-10); a refusal is a stable code and writes nothing.
import { appError, defineOperation, failed, ok, shape, textField } from "../../kernel";
import { DISCOVER_SOURCE, wishNameKey, type DecisionStore, type WishStatus } from "../../wishlist";

export interface UndoDecisionDependencies {
  readonly decisions: DecisionStore;
}

export interface UndoDecisionResult {
  /** `false`: nothing was taken back, because the decision is gone already or the species has no wish of the account. */
  readonly undone: boolean;
}

/** The input of `discover.undo`: the species of the card the keeper takes back, as the card names it. */
export const discoverUndoSchema = shape({
  species: textField("species", { min: 1, max: 200 }),
});

/** The status a Yes or No gave its wish (`discoverDecide`): a Yes is open on the wishlist, a No is discarded. */
const STATUS: Record<"yes" | "no", WishStatus> = { yes: "wishlist", no: "discarded" };

/**
 * `discover.undo` (US-ENT-04). Only the account's last Yes or No can be taken back, once: an earlier one is
 * `discover.undo_not_last`. A wish that was changed since (bought, discarded, linked to a specimen) is
 * `discover.undo_changed`, and a wish that is no Discover wish is `discover.not_a_decision`; all three write nothing.
 * Repeating the undo after it took effect answers `undone: false`, so a second call with a new key cannot take back a
 * second decision. The species names the decision, so a stale screen cannot take back another card.
 */
export const discoverUndo = (deps: UndoDecisionDependencies) =>
  defineOperation({
    name: "discover.undo",
    schema: discoverUndoSchema,
    run: async ({ userId }, input) => {
      const found = await deps.decisions.decisionOf(userId, wishNameKey(input.species));
      if (found === null) return ok<UndoDecisionResult>({ undone: false });
      if (found.source !== DISCOVER_SOURCE) return failed(appError("discover.not_a_decision"));
      const { wish, decision } = found;
      if (decision === null) return failed(appError("discover.undo_not_last"));
      if (wish.status !== STATUS[decision] || wish.specimenId !== null)
        return failed(appError("discover.undo_changed"));
      const r = await deps.decisions.takeBackDecision(userId, {
        wishId: wish.id,
        decision,
        status: STATUS[decision],
      });
      if (r === "not_found") return ok<UndoDecisionResult>({ undone: false });
      if (r === "not_last") return failed(appError("discover.undo_not_last"));
      if (r === "changed") return failed(appError("discover.undo_changed"));
      return ok<UndoDecisionResult>({ undone: true });
    },
  });
