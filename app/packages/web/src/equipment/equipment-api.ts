import type { EquipmentRow, EquipmentStatus, ZoneEquipmentView } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

export type { EquipmentRow, EquipmentStatus, ZoneEquipmentView };

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
  lightZoneId?: string;
}

/** The page data: the equipment and the devices per light zone, loaded together so the page has one state. */
export interface EquipmentData {
  readonly items: readonly EquipmentRow[];
  readonly zones: ZoneEquipmentView;
}

/** Loads the equipment (US-EQU-01) and the lamps per light zone (US-EQU-02); private by default (P-05). */
export async function loadEquipment(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentData>> {
  const [list, zones] = await Promise.all([
    call<{ equipment: EquipmentRow[] }>(fetchFn, `${api}/equipment`, token),
    call<ZoneEquipmentView>(fetchFn, `${api}/equipment/zones`, token),
  ]);
  if (!list.ok) return list;
  if (!zones.ok) return zones;
  return { ok: true, value: { items: list.value.equipment, zones: zones.value } };
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

/** Moves a lamp to another light zone (US-EQU-02). */
export async function setLampZone(
  api: string,
  token: string,
  target: { id: string; lightZoneId: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/zone`,
    { lightZoneId: target.lightZoneId },
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Sets the state of a device: active, defective or retired (US-EQU-02). */
export async function setEquipmentStatus(
  api: string,
  token: string,
  target: { id: string; status: EquipmentStatus },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/status`,
    { status: target.status },
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}
