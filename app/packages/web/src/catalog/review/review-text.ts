import type { ApprovalIssue, MergeOutcome, ReviewEntry, ReviewList } from "@pflanzendex/core";
import { FIELDS } from "../shared/text";

const DAY = 86_400_000;

/** Age of a proposal in whole days since its creation (derived, never stored). */
export function ageText(createdAt: string, now: number): string {
  const days = Math.max(0, Math.floor((now - Date.parse(createdAt)) / DAY));
  if (days === 0) return "heute";
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

/** A case is an approved operator batch (`curated`), the other entries are open proposals (US-BES-10). */
export function isBatch(entry: ReviewEntry): boolean {
  return entry.reviewCase.status === "curated";
}

/** The short facts of a row that need attention: AI marking, missing fields, a possible duplicate (P-09, P-10). */
export function flagsOf(entry: ReviewEntry): string[] {
  return [
    ...(entry.aiCreated ? ["KI-erstellt"] : []),
    ...(entry.issues.length > 0 ? ["Angaben fehlen"] : []),
    ...(entry.similar.length > 0 ? ["Mögliche Dublette"] : []),
  ];
}

/** What the operator sees above the open proposals: number and age (US-BES-10, weekly routine). Empty when none is open; the empty state says so instead. */
export function summaryText(list: ReviewList, now: number): string {
  if (list.open === 0 || !list.oldestOpenAt) return "";
  const count = list.open === 1 ? "1 offener Vorschlag" : `${list.open} offene Vorschläge`;
  return `${count}, der älteste ${ageText(list.oldestOpenAt, now)}. Tippe eine Art an, um sie zu prüfen.`;
}

/** Why the profile cannot be approved yet, in words a reviewer can act on. */
export function issueText(issue: ApprovalIssue): string {
  const name = FIELDS[issue.field] ?? issue.field;
  return issue.reason === "source_missing"
    ? "Quelle fehlt (Pflicht für Lichtbedarf und Ruhephase)"
    : `${name} fehlt`;
}

const KIND: Record<string, [string, string]> = {
  specimen: ["Pflanze", "Pflanzen"],
  care_profile: ["Pflegeprofil", "Pflegeprofile"],
};
const noun = (kind: string, n: number) => (KIND[kind] ?? [kind, kind])[n === 1 ? 0 : 1];

/** What a merge did: every moved and every kept reference is named (P-10, nothing is lost silently). */
export function movedText(outcome: MergeOutcome): string {
  const parts = outcome.moved.flatMap((m) => [
    ...(m.moved > 0 ? [`${m.moved} ${noun(m.kind, m.moved)} übernommen`] : []),
    ...(m.kept > 0
      ? [
          `${m.kept} ${noun(m.kind, m.kept)} nicht übernommen, weil der Ersteller dafür schon einen Eintrag bei der Zielart hat`,
        ]
      : []),
  ]);
  return parts.length === 0
    ? "Beim Ersteller hing noch nichts an diesem Vorschlag."
    : `${parts.join("; ")}.`;
}
