import type {
  EquipmentPrefill,
  EquipmentWishBuyResult,
  EquipmentWishList,
  EquipmentWishRow,
} from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../../kernel";

export type { EquipmentPrefill, EquipmentWishBuyResult, EquipmentWishList, EquipmentWishRow };

/** The fields of a new equipment wish; empty ones stay out (unknown, P-08). */
export interface EquipmentWishInput {
  equipmentType: string;
  name: string;
  productId?: string;
  priceEur?: number;
}

/** Loads the equipment wishes by status (US-EQU-08); private to the account (P-05). */
export function loadEquipmentWishes(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentWishList>> {
  return call<EquipmentWishList>(fetchFn, `${api}/equipment/wishes`, token);
}

/** Records a wish of type equipment (US-EQU-08) through the validating operation. */
export async function createEquipmentWish(
  api: string,
  token: string,
  input: EquipmentWishInput,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentWishRow>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/equipment/wishes", input);
  return r.ok ? { ok: true, value: (r.value as { wish: EquipmentWishRow }).wish } : r;
}

/** "Gekauft": the answer carries the prefill for the equipment form (US-EQU-08). */
export async function buyEquipmentWish(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentWishBuyResult>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/wishes/${encodeURIComponent(wishId)}/buy`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as EquipmentWishBuyResult } : r;
}

/** Discards an open equipment wish; it stays readable (P-10). */
export async function discardEquipmentWish(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentWishRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/wishes/${encodeURIComponent(wishId)}/discard`,
    {},
  );
  return r.ok ? { ok: true, value: (r.value as { wish: EquipmentWishRow }).wish } : r;
}
