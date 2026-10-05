import {
  appError,
  defineOperation,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  textField,
} from "../kernel";
import { httpsUrlField } from "./fields";
import { WISH_LIMITS, type WishStore } from "./types";

export interface CreateWishDependencies {
  readonly wishes: WishStore;
}

const schema = shape({
  name: textField("name", WISH_LIMITS.name),
  german: orNull(textField("german", WISH_LIMITS.german)),
  targetZoneId: orNull(idField("targetZoneId")),
  difficulty: orNull(integerField("difficulty", WISH_LIMITS.difficulty)),
  reasoning: orNull(textField("reasoning", WISH_LIMITS.reasoning)),
  imageUrl: orNull(httpsUrlField("imageUrl")),
  imageSource: orNull(textField("imageSource", WISH_LIMITS.imageSource)),
  license: orNull(textField("license", WISH_LIMITS.license)),
});

/**
 * Records a wish (FR-WUN-01): only the name is required, everything else stays unknown instead of guessed (P-08). The
 * wish starts as an open plant wish (`status = wishlist`). A picture needs its source and the other way round (images
 * are saved with source, US-WUN-04); the difficulty is the number 1 to 3 (FR-WUN-04). A duplicate name, also in
 * another letter case, is refused (FR-WUN-06); a zone of another account looks like an unknown zone (P-04). Nothing is
 * written on refusal, the same Idempotency-Key writes once (US-QS-03).
 */
export const wishCreate = (deps: CreateWishDependencies) =>
  defineOperation({
    name: "wish.create",
    schema,
    run: async ({ userId }, input) => {
      if ((input.imageUrl === null) !== (input.imageSource === null))
        return failed(
          appError("input.invalid", {
            details: [
              {
                field: input.imageUrl === null ? "imageUrl" : "imageSource",
                code: "input.invalid",
              },
            ],
          }),
        );
      const r = await deps.wishes.create(userId, input);
      if (r === "name_taken") return failed(appError("wish.name_taken"));
      if (r === "zone_unknown") return failed(appError("light_zone.not_found"));
      return ok(r);
    },
  });
