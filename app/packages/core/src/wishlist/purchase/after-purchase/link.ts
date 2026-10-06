import { appError, defineOperation, failed, idField, ok, shape } from "../../../kernel";
import { titleOf } from "../../candidates";
import type { WishRow, WishStore } from "../../types";

export interface LinkDependencies {
  readonly wishes: Pick<WishStore, "link">;
}

/** What the link did (P-10): "bought → specimen". */
export interface WishLinkResult {
  readonly wish: WishRow;
  /** `false`: the wish was linked to this specimen already, nothing was written again. */
  readonly changed: boolean;
  readonly hint: { readonly text: string };
}

const schema = shape({ wishId: idField("wishId"), specimenId: idField("specimenId") });

const ERROR = {
  not_found: "wish.not_found",
  not_bought: "wish.not_bought",
  specimen_unknown: "specimen.not_found",
  already_linked: "wish.already_linked",
} as const;

/**
 * Links a bought wish to the specimen it became (US-WUN-05, "bought → specimen"). Only a bought wish is linked
 * (`wish.not_bought`); a wish keeps its first specimen and a specimen belongs to one wish only (`wish.already_linked`).
 * Linking the same pair again changes nothing (`changed: false`). A wish or specimen of another account looks like an
 * unknown one: `wish.not_found`, `specimen.not_found` (P-04). The specimen itself is created by `specimen.create`;
 * the app wires both (ADR 0003).
 */
export const wishLinkSpecimen = (deps: LinkDependencies) =>
  defineOperation({
    name: "wish.link_specimen",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.link(userId, input.wishId, input.specimenId);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      const title = titleOf(r.wish);
      return ok<WishLinkResult>({
        ...r,
        hint: {
          text: r.changed
            ? `Der Wunsch „${title}“ ist mit deinem neuen Exemplar verknüpft.`
            : `Der Wunsch „${title}“ war mit diesem Exemplar schon verknüpft; es wurde nichts geändert.`,
        },
      });
    },
  });
