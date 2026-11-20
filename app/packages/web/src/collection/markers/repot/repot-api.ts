import type { RepotPlan, RepotSign } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../../shared/data";
import { COLLECTION_KEY } from "../../specimens/hooks/use-collection";

type FetchFn = typeof fetch;

/**
 * The repot plan of a plant as the API answers it (US-BES-19, FR-BES-27): the plan itself and the switches. `hidden` while
 * the keeper switch "repot_planner" is off (no hints, observations or pots); `equipmentOff` while "equipment" is off.
 */
export type RepotPlanView = RepotPlan & {
  readonly specimenId: string;
  readonly status: "plant" | "cutting";
  readonly hidden: boolean;
  readonly equipmentOff: boolean;
};

/** The query of one plant's plan. It sits under the collection key, so a write there reloads it too (P-10). */
export const REPOT_PLAN_KEY = (specimenId: string) =>
  [...COLLECTION_KEY, "repot-plan", specimenId] as const;

/** The plan of one plant, derived live by the API for the keeper's local day (NFR-08). */
export async function loadRepotPlan(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<RepotPlanView>> {
  return call<RepotPlanView>(
    fetchFn,
    `${api}/specimens/${encodeURIComponent(specimenId)}/repot-plan?timeZone=${encodeURIComponent(currentTimeZone())}`,
    token,
  );
}

/** Ticks or clears one observation of a plant (US-BES-19); the repeat-guard key is created per call. */
export async function setRepotSign(
  api: string,
  token: string,
  input: { id: string; sign: RepotSign; ticked: boolean },
  fetchFn: FetchFn = fetch,
): Promise<Response<unknown>> {
  return createWrite(api, token, fetchFn)(
    "POST",
    `/specimens/${encodeURIComponent(input.id)}/repot-signs`,
    { sign: input.sign, ticked: input.ticked, timeZone: currentTimeZone() },
  );
}
