import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import type { CareProfileFields } from "./schemas";

/** What the form fields hold (all text, as typed or chosen); an empty text means "no deviation". */
export type Draft = CareProfileFields;

/** `MM-DD` -> month and day as the plain numbers the selects offer ("10-05" -> "10", "5"). */
function split(tag: string | undefined): [string, string] {
  if (!tag) return ["", ""];
  return [String(Number(tag.slice(0, 2))), String(Number(tag.slice(3, 5)))];
}

export function draftOf(entry: CareProfileEntry): Draft {
  const p = entry.profile;
  const [fromMonth, fromDay] = split(p.dormancy.own?.from);
  const [untilMonth, untilDay] = split(p.dormancy.own?.until);
  return {
    growthLocationId: p.growthLocation.own ?? "",
    dormancyLocationId: p.dormancyLocation.own ?? "",
    lightZoneId: p.lightZone.own ?? "",
    fromMonth,
    fromDay,
    untilMonth,
    untilDay,
    wateringGrowthDays: p.wateringGrowthDays.own?.toString() ?? "",
    wateringDormancyDays: p.wateringDormancyDays.own?.toString() ?? "",
    ownHints: p.ownHints.own ?? "",
  };
}

const tag = (month: string, day: string) => `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
const textOrNull = (v: string) => (v.trim() === "" ? null : v);

export interface Outcome {
  readonly changes?: CareProfileChanges;
  readonly problem?: string;
}

/** The dormancy period changes as a pair: both set, both reset, never half (the server demands the same). */
function dormancyChanges(before: Draft, now: Draft): Outcome {
  const keys = ["fromMonth", "fromDay", "untilMonth", "untilDay"] as const;
  if (keys.every((k) => before[k] === now[k])) return {};
  const filled = keys.filter((k) => now[k] !== "");
  if (filled.length === 0) return { changes: { dormancyFrom: null, dormancyUntil: null } };
  if (filled.length < 4)
    return { problem: "Gib Beginn und Ende der Ruhephase vollständig an (Monat und Tag)." };
  return {
    changes: {
      dormancyFrom: tag(now.fromMonth, now.fromDay),
      dormancyUntil: tag(now.untilMonth, now.untilDay),
    },
  };
}

/** Only what differs from the saved state is sent: a value sets, `null` resets to the catalog. */
export function changesOf(before: Draft, now: Draft): Outcome {
  const dormancy = dormancyChanges(before, now);
  if (dormancy.problem) return dormancy;
  const changes: Record<string, unknown> = { ...dormancy.changes };
  const texts = ["growthLocationId", "dormancyLocationId", "lightZoneId", "ownHints"] as const;
  for (const k of texts) if (before[k] !== now[k]) changes[k] = textOrNull(now[k]);
  for (const k of ["wateringGrowthDays", "wateringDormancyDays"] as const)
    if (before[k] !== now[k]) changes[k] = now[k] === "" ? null : Number(now[k]);
  return Object.keys(changes).length === 0 ? {} : { changes: changes as CareProfileChanges };
}
