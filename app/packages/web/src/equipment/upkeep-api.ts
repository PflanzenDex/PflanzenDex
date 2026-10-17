import type { EquipmentRow, SupplyLevel } from "@pflanzendex/core";
import { createWrite, type Response } from "../kernel";

/** The operation data of a device; empty ones are `null` (unknown, P-08). A lifetime comes with its source. */
export interface MaintenanceInput {
  inOperationSince: string | null;
  checkIntervalDays: number | null;
  lifetimeValue: string | null;
  lifetimeSource: string | null;
}

/** Sets since when a device runs, its check interval and the manufacturer's lifetime statement (US-EQU-04). */
export async function setMaintenance(
  api: string,
  token: string,
  target: { id: string; input: MaintenanceInput },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/maintenance`,
    target.input,
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Notes that the keeper checked a device on a day (US-EQU-04). */
export async function markChecked(
  api: string,
  token: string,
  target: { id: string; checkedOn: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/checked`,
    { checkedOn: target.checkedOn },
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Sets how much of a consumable is left (US-EQU-05). */
export async function setSupply(
  api: string,
  token: string,
  target: { id: string; supply: SupplyLevel },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/supply`,
    { supply: target.supply },
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Links a plant agent to the text of `Treatment.Agent`; `null` removes the link (US-EQU-05). */
export async function linkAgent(
  api: string,
  token: string,
  target: { id: string; agentLink: string | null },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(target.id)}/agent-link`,
    { agentLink: target.agentLink },
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}

/** Assigns a sensor to a specimen or a location, or to none (US-EQU-06). */
export async function setSensorTarget(
  api: string,
  token: string,
  target: { id: string; specimenId: string | null; locationId: string | null },
  fetchFn: typeof fetch = fetch,
): Promise<Response<EquipmentRow>> {
  const { id, ...data } = target;
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/equipment/${encodeURIComponent(id)}/sensor-target`,
    data,
  );
  return r.ok ? { ok: true, value: r.value as EquipmentRow } : r;
}
