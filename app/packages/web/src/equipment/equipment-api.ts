import type {
  EquipmentRow,
  EquipmentStatus,
  LampLightView,
  LampMeasurement,
  Need,
  SensorView,
  SupplyLevel,
  ZoneEquipmentView,
} from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";
import {
  loadEquipmentSharing,
  type EquipmentSharingRow,
} from "./equipment-page/parts/sharing/sharing-api";
import { loadEquipmentWishes, type EquipmentWishList } from "./overviews/wishes-view/wishes-api";

export type {
  EquipmentRow,
  EquipmentStatus,
  LampLightView,
  LampMeasurement,
  Need,
  SensorView,
  SupplyLevel,
  ZoneEquipmentView,
};

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
  readonly light: LampLightView;
  readonly sensors: SensorView;
  readonly needs: readonly Need[];
  readonly wishes: EquipmentWishList;
  readonly sharing: readonly EquipmentSharingRow[];
}

/** Loads the equipment (US-EQU-01), the lamps per light zone (US-EQU-02) and their light intensity (US-EQU-03); private by default (P-05). */
export async function loadEquipment(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
  /** `sharing: false` while "social" is off (US-DEV-06): the sharing settings are not asked for, the route would answer 404. */
  options: { sharing?: boolean } = {},
): Promise<Response<EquipmentData>> {
  const ownSharing =
    options.sharing === false
      ? Promise.resolve({ ok: true as const, value: { shared: [] } })
      : loadEquipmentSharing(api, token, fetchFn);
  const [list, zones, light, sensors, needs, wishes, sharing] = await Promise.all([
    call<{ equipment: EquipmentRow[] }>(fetchFn, `${api}/equipment`, token),
    call<ZoneEquipmentView>(fetchFn, `${api}/equipment/zones`, token),
    call<LampLightView>(fetchFn, `${api}/equipment/lamps`, token),
    call<SensorView>(fetchFn, `${api}/equipment/sensors`, token),
    call<{ needs: Need[] }>(fetchFn, `${api}/equipment/needs`, token),
    loadEquipmentWishes(api, token, fetchFn),
    ownSharing,
  ]);
  if (!list.ok) return list;
  if (!zones.ok) return zones;
  if (!light.ok) return light;
  if (!sensors.ok) return sensors;
  if (!needs.ok) return needs;
  if (!wishes.ok) return wishes;
  if (!sharing.ok) return sharing;
  return {
    ok: true,
    value: {
      items: list.value.equipment,
      zones: zones.value,
      light: light.value,
      sensors: sensors.value,
      needs: needs.value.needs,
      wishes: wishes.value,
      sharing: sharing.value.shared,
    },
  };
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

/** The fields of one measurement; distance and method stay out when unknown (P-08). */
export interface MeasurementInput {
  measuredOn: string;
  lux: number;
  distanceCm?: number;
  method?: string;
}

/** Adds a measured light intensity to the log of a lamp (US-EQU-03). */
export async function measureLamp(
  api: string,
  token: string,
  target: { id: string; input: MeasurementInput },
  fetchFn: typeof fetch = fetch,
): Promise<Response<LampMeasurement>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/measurements`,
    target.input,
  );
  return r.ok ? { ok: true, value: (r.value as { measurement: LampMeasurement }).measurement } : r;
}

/** Sets what the manufacturer states about a lamp; `null` clears a value back to unknown (US-EQU-03). */
export async function describeLamp(
  api: string,
  token: string,
  target: { id: string; powerW: number | null; luxStatement: number | null },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const { id, ...data } = target;
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(id)}/lamp-data`,
    data,
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Sets the share by which a measurement may deviate from the zone ceiling; `null` = no check (US-EQU-03). */
export async function setDeviationLimit(
  api: string,
  token: string,
  percent: number | null,
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ percent: number | null }>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/equipment/lamps/limit", { percent });
  return r.ok ? { ok: true, value: r.value as { percent: number | null } } : r;
}
