// Cutting light (US-BES-04, FR-LIC-02): the lowest light zone of the account, derived and never stored (P-01).
// Cards and distribution use the same rule, so both classify a specimen the same way.
import type { LightZone } from "../../light";

/** The zone with the smallest sort order, `null` without zones (unknown, P-08). */
export const cuttingLight = (zones: readonly LightZone[]): LightZone | null =>
  zones.reduce<LightZone | null>(
    (lowest, z) => (!lowest || z.sortOrder < lowest.sortOrder ? z : lowest),
    null,
  );
