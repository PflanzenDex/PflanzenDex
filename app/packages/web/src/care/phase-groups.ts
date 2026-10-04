import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { locationText } from "./text";

/** A specimen whose target location is known and differs from where it stands (comparison by ID, FR-PHA-03). */
export const needsSwitch = (z: PhasesRow): boolean =>
  z.targetLocationId !== null && z.targetLocationId !== z.locationId;

/** Several specimens that move to the same target location and can be confirmed in one step (US-PHA-03). */
export interface SwitchGroup {
  readonly targetLocationId: string;
  readonly rows: readonly PhasesRow[];
}

/** Groups of at least two specimens per target location, in the order of the list. */
export function switchGroups(rows: readonly PhasesRow[]): readonly SwitchGroup[] {
  const byTarget = new Map<string, PhasesRow[]>();
  for (const z of rows.filter(needsSwitch)) {
    const target = z.targetLocationId as string;
    byTarget.set(target, [...(byTarget.get(target) ?? []), z]);
  }
  return [...byTarget]
    .filter(([, group]) => group.length > 1)
    .map(([targetLocationId, group]) => ({ targetLocationId, rows: group }));
}

/** What the page says after a successful confirmation (P-09): what changed and where the specimens stand now. */
export function switchedText(
  rows: readonly PhasesRow[],
  locations: readonly LightLocation[],
): string {
  const target = locationText(locations, rows[0]?.targetLocationId ?? null);
  return rows.length === 1
    ? `„${rows[0]?.name}“ steht jetzt am Standort „${target}“.`
    : `${rows.length} Exemplare stehen jetzt am Standort „${target}“.`;
}
