import { DisclosureSummary } from "@/shared/ui/display/more-help/disclosure-summary/disclosure-summary";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./year-in-review.de.json";

const t = texts(table);

/** One counted fact per row; its basis is listed behind "So wird gezählt" (P-08): nothing is rated or compared (FR-ACH-04). */
export const FACTS = [
  ["speciesCaught", "fact.speciesCaught", "basis.speciesCaught"],
  ["cuttingsRooted", "fact.cuttingsRooted", "basis.cuttingsRooted"],
  ["treatmentsCompleted", "fact.treatmentsCompleted", "basis.treatmentsCompleted"],
  ["measurements", "fact.measurements", "basis.measurements"],
  ["handovers", "fact.handovers", "basis.handovers"],
  ["achievementsEarned", "fact.achievementsEarned", "basis.achievementsEarned"],
] as const;

/**
 * The counting rules, listed once behind "So wird gezählt" (US-QS-32, P-08): one term and its basis per fact, so no row
 * carries brackets and every basis is read in one place.
 */
export function CountingRules() {
  return (
    <details>
      <DisclosureSummary className="text-sm font-semibold">{t("countingRules")}</DisclosureSummary>
      <dl className="m-0 mt-2 grid gap-2 text-sm">
        {FACTS.map(([key, label, basis]) => (
          <div key={key}>
            <dt className="font-semibold">{t(label)}</dt>
            <dd className="m-0 text-muted-foreground">{t(basis)}</dd>
          </div>
        ))}
        <div>
          <dt className="font-semibold">{t("fact.growth")}</dt>
          <dd className="m-0 text-muted-foreground">{t("growthBasis")}</dd>
        </div>
      </dl>
    </details>
  );
}
