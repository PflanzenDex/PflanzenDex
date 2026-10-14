import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
} from "../../kernel";
import { wishNameKey } from "../../wishlist/repair/name-key";
import { priceField, productIdField } from "../record";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES, type EquipmentType } from "../store/types";
import type { EquipmentWishRow, EquipmentWishStore } from "./types";

export interface EquipmentWishDependencies {
  readonly wishes: EquipmentWishStore;
}

const createSchema = shape({
  equipmentType: choiceField("equipmentType", EQUIPMENT_TYPES),
  name: textField("name", EQUIPMENT_LIMITS.name),
  productId: orNull(productIdField("productId")),
  priceEur: orNull(priceField("priceEur")),
});

/**
 * Records a wish of type equipment (US-EQU-08): type and name are required, product id and price stay unknown
 * instead of guessed (P-08). The name is unique among all wishes of the account (FR-WUN-06). The wish starts open and
 * is never a plant candidate (no buffer, no zone hint). Nothing is written on refusal, the same Idempotency-Key writes
 * once (US-QS-03).
 */
export const equipmentWishCreate = (deps: EquipmentWishDependencies) =>
  defineOperation({
    name: "equipment_wish.create",
    schema: createSchema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.create(userId, { ...input, nameKey: wishNameKey(input.name) });
      return r === "name_taken" ? failed(appError("wish.name_taken")) : ok(r);
    },
  });

/** The fields "Bought" hands to the form of US-EQU-01; only what the wish knows, no date (nothing invented, P-08). */
export interface EquipmentPrefill {
  readonly type: EquipmentType;
  readonly name: string;
  readonly productId: string | null;
  readonly priceEur: number | null;
}

export interface EquipmentWishBuyResult {
  readonly wish: EquipmentWishRow;
  /** `false`: the wish was bought already, nothing was written again. */
  readonly changed: boolean;
  readonly prefill: EquipmentPrefill;
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const idSchema = shape({ wishId: idField("wishId") });
const ERROR = { not_found: "wish.not_found", not_open: "wish.not_open" } as const;

/**
 * "Bought" for an equipment wish (US-EQU-08): the open wish becomes `bought` (kept under the bought wishes, P-10) and
 * the answer carries the prefill for the equipment form: name, product id, type and the price if the wish had one. The
 * price goes into the cost view (US-EQU-09) only once the equipment is recorded; without a price nothing is invented.
 * Idempotent like `wish.buy`; a discarded wish is `wish.not_open`.
 */
export const equipmentWishBuy = (deps: EquipmentWishDependencies) =>
  defineOperation({
    name: "equipment_wish.buy",
    schema: idSchema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.buy(userId, input.wishId);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      const { wish } = r;
      return ok<EquipmentWishBuyResult>({
        ...r,
        prefill: {
          type: wish.equipmentType,
          name: wish.name,
          productId: wish.productId,
          priceEur: wish.priceEur,
        },
        hint: {
          text: r.changed
            ? `„${wish.name}“ ist als gekauft vermerkt und steht nicht mehr unter den offenen Wünschen.`
            : `„${wish.name}“ war schon als gekauft vermerkt; es wurde nichts geändert.`,
          nextAction:
            "Erfasse das Equipment: Name, Produkt-ID, Art und Preis sind vorausgefüllt, das Kaufdatum trägst du selbst ein.",
        },
      });
    },
  });

/** Discards an open equipment wish (kept, never deleted, P-10); an already discarded one is answered unchanged. */
export const equipmentWishDiscard = (deps: EquipmentWishDependencies) =>
  defineOperation({
    name: "equipment_wish.discard",
    schema: idSchema,
    run: async ({ userId }, input) => {
      const r = await deps.wishes.discard(userId, input.wishId);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });

/** The equipment wishes by status; the count of the open ones is separate from the plant candidates (US-EQU-08). */
export interface EquipmentWishList {
  readonly open: readonly EquipmentWishRow[];
  readonly bought: readonly EquipmentWishRow[];
  readonly discarded: readonly EquipmentWishRow[];
}

export async function equipmentWishes(
  deps: EquipmentWishDependencies,
  userId: string,
): Promise<EquipmentWishList> {
  const all = await deps.wishes.list(userId);
  const by = (status: EquipmentWishRow["status"]) => all.filter((w) => w.status === status);
  return { open: by("wishlist"), bought: by("bought"), discarded: by("discarded") };
}
