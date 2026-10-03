import { failed, integerField, shape, ok, type Result } from "../kernel";
import type { LightZone } from "./types";

/** Promote from 80 % of the lux ceiling of the current level, stay at more than 30 % distance to the ceiling of the next (US-LIC-01). */
export const PROMOTE_FROM = { counter: 8, denominator: 10 } as const;
export const GAP_MAX = { counter: 7, denominator: 10 } as const;

export interface DerivationInput {
  /** Lux need for maximum growth (saturation point); `null` = unknown (P-08). */
  readonly lightDemandLux: number | null;
  /** Default level 2–4 of the preset (catalog). */
  readonly standardLevel: number;
  /** C3 plant with a soft leaf ("sun-loving"): is not promoted automatically. */
  readonly softLeaf: boolean;
}

export type DerivationReason =
  "standard" | "promoted" | "need_to_low_for_higher_zone" | "soft_leaf" | "top_zone";

export type Derivation =
  | {
      readonly kind: "zone";
      readonly zone: LightZone;
      /** Position among the zones of the account, 1 = cutting light (never a target). */
      readonly level: number;
      readonly reason: DerivationReason;
    }
  | { readonly kind: "unknown"; readonly reason: "no_need" | "no_adult_zone" };

const reached = (need: number, ceiling: number, f: { counter: number; denominator: number }) =>
  need * f.denominator >= ceiling * f.counter;

/**
 * Derives the light zone of a species from the lux need and the zones of the account (FR-BES-10), live and without
 * storing (P-01). The lowest zone is cutting light and never a target for adults. Without a need the zone stays
 * "unknown" (FR-LIC-03); if the account has fewer zones than the default level, the highest available applies.
 */
export function zoneDerive(input: DerivationInput, zones: readonly LightZone[]): Derivation {
  const adult = [...zones].sort((a, b) => a.sortOrder - b.sortOrder).slice(1);
  const need = input.lightDemandLux;
  if (need === null) return { kind: "unknown", reason: "no_need" };
  if (adult.length === 0) return { kind: "unknown", reason: "no_adult_zone" };

  const start = Math.min(Math.max(input.standardLevel - 2, 0), adult.length - 1);
  let i = start;
  let reason: DerivationReason = "standard";
  for (let n = adult[i + 1]; n; n = adult[i + 1]) {
    const step = nextStep(input, need, adult[i] as LightZone, n);
    if (step !== "promoted") {
      reason = step;
      break;
    }
    i += 1;
    reason = step;
  }
  if (i === start && reason === "need_to_low_for_higher_zone") reason = "standard";
  if (!adult[i + 1] && i === start) reason = "top_zone";
  return { kind: "zone", zone: adult[i] as LightZone, level: i + 2, reason };
}

function nextStep(
  input: DerivationInput,
  need: number,
  current: LightZone,
  next: LightZone,
): "promoted" | "soft_leaf" | "need_to_low_for_higher_zone" {
  if (input.softLeaf) return "soft_leaf";
  const fits =
    reached(need, current.luxCeiling, PROMOTE_FROM) && reached(need, next.luxCeiling, GAP_MAX);
  return fits ? "promoted" : "need_to_low_for_higher_zone";
}

const inputSchema = shape({
  lightDemandLux: integerField("lightDemandLux", { min: 1, max: 200_000 }),
  standardLevel: integerField("standardLevel", { min: 2, max: 4 }),
});

/** Checks raw input (e.g. from the request) and then derives the zone; invalid input yields `input.invalid`. */
export function zoneDeriveReviewed(
  raw: { lightDemandLux: unknown; standardLevel: unknown; softLeaf?: boolean },
  zones: readonly LightZone[],
): Result<Derivation> {
  const r = inputSchema(raw);
  if (!r.ok) return failed(r.error);
  return ok(zoneDerive({ ...r.value, softLeaf: raw.softLeaf === true }, zones));
}
