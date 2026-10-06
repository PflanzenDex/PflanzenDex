import { appError, defineOperation, failed, idField, ok, shape, textField } from "../../kernel";
import { titleOf } from "../candidates";
import { wishNameKey } from "../name-key";
import { WISH_LIMITS, type WishRow, type WishStore } from "../types";

export interface RepairDependencies {
  readonly wishes: Pick<WishStore, "rename" | "remove">;
}

export interface WishRenameResult {
  readonly wish: WishRow;
  readonly hint: { readonly text: string; readonly nextAction: string };
}

export interface WishRemoveResult {
  readonly removed: WishRow;
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const ERROR = {
  not_found: "wish.not_found",
  not_duplicate: "wish.not_duplicate",
  name_taken: "wish.name_taken",
} as const;

const renameSchema = shape({
  wishId: idField("wishId"),
  name: textField("name", WISH_LIMITS.name),
});

const removeSchema = shape({ wishId: idField("wishId") });

/**
 * Repairs a duplicate name (FR-WUN-06, #303): renames a wish that has no name key (it collided with an older wish
 * after folding diacritics when migration 0020 ran). The new name gets its key and must be free, so the wish leaves
 * the exempt group; keeping the same name is refused (`wish.name_taken`) because it would stay a duplicate. Any other
 * wish is `wish.not_duplicate`; a wish of another account looks unknown: `wish.not_found` (P-04). Nothing is written
 * on refusal; the same Idempotency-Key writes once (US-QS-03).
 */
export const wishRename = (deps: RepairDependencies) =>
  defineOperation({
    name: "wish.rename",
    schema: renameSchema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.rename(userId, input.wishId, input.name, wishNameKey(input.name));
      if (typeof r === "string") return failed(appError(ERROR[r]));
      return ok<WishRenameResult>({
        wish: r,
        hint: {
          text: `Der Wunsch heißt jetzt „${titleOf(r)}“ und ist kein Doppelgänger mehr.`,
          nextAction: "Prüfe, ob noch weitere Wünsche gleich heißen.",
        },
      });
    },
  });

/**
 * The second repair (FR-WUN-06, #303): deletes a wish that has no name key, which merges it into the older wish of
 * the same name. Only such a duplicate can be deleted here; a regular wish is `wish.not_duplicate` and stays, so
 * nothing disappears silently (P-10). Another account's wish looks unknown (P-04).
 */
export const wishRemove = (deps: RepairDependencies) =>
  defineOperation({
    name: "wish.remove_duplicate",
    schema: removeSchema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.remove(userId, input.wishId);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      return ok<WishRemoveResult>({
        removed: r,
        hint: {
          text: `„${titleOf(r)}“ ist gelöscht; der Wunsch mit demselben Namen bleibt.`,
          nextAction: "Prüfe, ob noch weitere Wünsche gleich heißen.",
        },
      });
    },
  });
