import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";

const BLOCKING_IMPACT = new Set(["serious", "critical"]);

// FR-QG-09 / QG-U1: axe findings go to the test attachments and the job summary. Views passed with
// `{ blocking: true }` (the start page and one list page, QG-U5) additionally fail the test on serious or
// critical findings; contrast findings are fixed in code, never allow-listed. A broken report never fails a test.
function appendSummary(
  summary: string,
  info: TestInfo,
  view: string,
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): void {
  const rows = violations.map(
    (v) => `| ${info.project.name} | ${view} | ${v.id} | ${v.impact ?? "?"} | ${v.nodes.length} |`,
  );
  const head = `\n#### axe: ${info.project.name} / ${view}\n`;
  const table = rows.length
    ? `| Project | View | Rule | Impact | Nodes |\n|---|---|---|---|---|\n${rows.join("\n")}\n`
    : "No violations found.\n";
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from the CI runner, not from input
  fs.appendFileSync(summary, head + table);
}

export async function axeReport(
  page: Page,
  info: TestInfo,
  view: string,
  options: { blocking?: boolean } = {},
): Promise<void> {
  let blocking: string[] = [];
  try {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    blocking = violations
      .filter((v) => BLOCKING_IMPACT.has(v.impact ?? ""))
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    await info.attach(`axe-${view}.json`, {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary) appendSummary(summary, info, view, violations);
  } catch (e) {
    // A broken report must not break the run either.
    console.warn(`axe report for ${view} failed: ${String(e)}`);
  }
  if (options.blocking && blocking.length > 0)
    throw new Error(`axe found serious or critical violations in ${view}:\n${blocking.join("\n")}`);
}
