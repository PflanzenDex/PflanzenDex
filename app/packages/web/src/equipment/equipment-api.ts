import type { EquipmentRow } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

export type { EquipmentRow };

/** The fields of the API input of `equipment.record`; empty ones stay out (unknown, P-08). */
export interface EquipmentInput {
  type: string;
  name: string;
  manufacturer?: string;
  model?: string;
  productId?: string;
  priceEur?: number;
  boughtAt?: string;
  note?: string;
}

/** Loads the equipment of the account (US-EQU-01); private by default (P-05). */
export async function loadEquipment(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly EquipmentRow[]>> {
  const r = await call<{ equipment: EquipmentRow[] }>(fetchFn, `${api}/equipment`, token);
  return r.ok ? { ok: true, value: r.value.equipment } : r;
}

/** Records a piece of equipment (US-EQU-01) through the validating operation. */
export async function recordEquipment(
  api: string,
  token: string,
  input: EquipmentInput,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/equipment", input);
  return r.ok ? { ok: true, value: (r.value as { equipment: EquipmentRow }).equipment } : r;
}
