/** The comparison values as cells, pure helpers without rendering: `null` = unknown (P-08, US-BES-05, US-QS-24). */
import type { DifficultyRow } from "@pflanzendex/core";
import { zoneLabel } from "@pflanzendex/core";
import {
  isUnknown,
  missingText,
  type Fact,
} from "@/components/shared/responsive/responsive-table/fact-grid/fact-grid";
import { keepTogether } from "@/lib/format";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
/** Unknown difficulty is `null` (P-08), never "Leicht"; the fold shows it (US-QS-24). */
const level = (d: number | null): string | null => (d === null ? null : (LEVELS[d] ?? null));
const OWN = " (dein Pflegeprofil)";

/** The zone; my care-profile zone says where it comes from (US-BES-09, #306). */
const zoneText = (r: DifficultyRow): string | null =>
  r.zone ? `${zoneLabel(r.zone.name)}${r.zoneSource === "profile" ? OWN : ""}` : null;

/** My watering intervals from the care profile, else the catalog hint (US-BES-09, #306). */
function wateringText(r: DifficultyRow): string | null {
  const own = r.ownWatering;
  if (!own) return r.wateringHint;
  const parts = [
    own.growthDays === null ? null : keepTogether(`alle ${own.growthDays} Tage`),
    own.dormancyDays === null ? null : keepTogether(`in der Ruhe alle ${own.dormancyDays} Tage`),
  ].filter((p): p is string => p !== null);
  return `${parts.join(", ")}${OWN}`;
}

/** The values of one species in the order of the comparison; `null` = unknown, folded in the layer (US-QS-24). */
const FACTS: { header: string; value: (r: DifficultyRow) => string | null }[] = [
  { header: "Botanischer Name", value: (r) => r.botanicalName },
  { header: "Lichtzone", value: zoneText },
  { header: "Gießregel", value: wateringText },
  { header: "Substrat", value: (r) => r.substrate },
  { header: "Schnitt", value: (r) => r.pruning },
  { header: "Erfolgskriterium", value: (r) => r.successCriteria },
  { header: "Schwierigkeit", value: (r) => level(r.difficulty) },
];

/** All values of one species for the layer; labels are unique (the header of each column). */
export const factsOf = (r: DifficultyRow): Fact[] =>
  FACTS.map((c) => ({ label: c.header, value: c.value(r) }));

/** The two values of the entry; a value unknown for every species is hidden there (US-QS-24). */
export const ENTRY_FACTS = (r: DifficultyRow): Fact[] => [
  { label: "Schwierigkeit", value: level(r.difficulty) },
  { label: "Lichtzone", value: zoneText(r) },
];

/** The entry line: the known values, the unknown ones as one count (US-QS-24, P-08). */
export function entryLine(r: DifficultyRow, hidden: readonly string[]): string {
  const shown = ENTRY_FACTS(r).filter((f) => !hidden.includes(f.label));
  const known = shown.filter((f) => !isUnknown(f.value)).map((f) => f.value);
  const missing = shown.length - known.length;
  return [...known, missing > 0 ? missingText(missing) : null].filter(Boolean).join(" · ");
}
