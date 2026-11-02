import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { Finding } from "./findings";

// axe half of the gate (FR-QG-24, issue 467): WCAG 2.2 A and AA rules, a stricter bar than the WCAG 2.1 AA target of
// E-23; a violation of impact serious or critical is a finding.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING_IMPACT = new Set(["serious", "critical"]);

/** Runs axe on the page as it is now; one finding per rule with the selectors of the offending nodes. */
export async function axeFindings(page: Page): Promise<Finding[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => BLOCKING_IMPACT.has(v.impact ?? ""))
    .map((v) => ({
      kind: "axe" as const,
      rule: v.id,
      count: v.nodes.length,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    }));
}
