import type { SensorView } from "@pflanzendex/core";

/** The place of a sensor as `SensorActions.onTarget` takes it: a specimen, a location or neither (US-EQU-06). */
export type SensorTarget = { specimenId: string | null; locationId: string | null };

/** The choice as one text: `specimen:<id>`, `location:<id>` or empty for none. */
export const valueOf = (t: SensorView["sensors"][number]["target"]): string =>
  t ? `${t.kind}:${t.id}` : "";

export const toTarget = (value: string): SensorTarget => {
  const [kind, id] = value.split(":");
  return {
    specimenId: kind === "specimen" && id ? id : null,
    locationId: kind === "location" && id ? id : null,
  };
};

/** What a pick of the list hands over: the choice as `specimen:<id>`, `location:<id>` or empty for none, and its name as the list shows it. */
export type Choice = { value: string; name: string };
