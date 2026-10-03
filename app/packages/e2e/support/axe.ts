import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";

// FR-QG-09 / QG-U1: axe runs as a report only. Findings go to the test attachments and the job summary,
// they never fail a test (a new gate starts as a report, spec 18).
export async function axeBericht(page: Page, info: TestInfo, ansicht: string): Promise<void> {
  try {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await info.attach(`axe-${ansicht}.json`, {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (!summary) return;
    const rows = violations.map(
      (v) =>
        `| ${info.project.name} | ${ansicht} | ${v.id} | ${v.impact ?? "?"} | ${v.nodes.length} |`,
    );
    const head = `\n#### axe: ${info.project.name} / ${ansicht} (report only)\n`;
    const table = rows.length
      ? `| Project | View | Rule | Impact | Nodes |\n|---|---|---|---|---|\n${rows.join("\n")}\n`
      : "No violations found.\n";
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from the CI runner, not from input
    fs.appendFileSync(summary, head + table);
  } catch (e) {
    // A broken report must not break the run either.
    console.warn(`axe report for ${ansicht} failed: ${String(e)}`);
  }
}
