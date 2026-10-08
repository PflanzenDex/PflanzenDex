// Code duplication ratchet (QG-K5, FR-QG-10, issue 479) with jscpd. Complements QG-K4 (Fallow, 3+ copies in changed files):
// this gate bounds the share of duplicated lines in the whole project. Detection settings live in app/.jscpd.json,
// the threshold once in quality-limits.json ("dup": { "maxPercent", "slackPercent" }).
//   DUP-1  duplicated lines exceed maxPercent: fix the clones, never raise maxPercent.
//   DUP-2  duplicated lines are more than slackPercent below maxPercent: lower maxPercent to the measured value (ratchet).
// Target (owner decision): at most 1 %. maxPercent only goes down until it reaches 1.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TARGET_PERCENT = 1;

// Pure verdict: errors for a measured percentage against the limits.
export function checkDup(percent, limits) {
  const errors = [];
  if (limits.maxPercent < TARGET_PERCENT)
    errors.push(
      `DUP-3 maxPercent ${limits.maxPercent} is below the target ${TARGET_PERCENT}, set it to the target`,
    );
  if (percent > limits.maxPercent)
    errors.push(
      `DUP-1 ${percent.toFixed(2)} % of the lines are duplicated, limit is ${limits.maxPercent} %: remove the clones (never raise the limit)`,
    );
  else if (limits.maxPercent > TARGET_PERCENT && percent < limits.maxPercent - limits.slackPercent)
    errors.push(
      `DUP-2 ${percent.toFixed(2)} % duplicated is below the limit ${limits.maxPercent} %: lower maxPercent in quality-limits.json to ${Math.max(TARGET_PERCENT, Math.ceil(percent * 100) / 100)}`,
    );
  return errors;
}

// The biggest clones first, for the failure message and the report.
export function biggest(report, count = 5) {
  return [...(report.duplicates ?? [])]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, count)
    .map(
      (d) =>
        `  ${d.lines} lines: ${d.firstFile.name}:${d.firstFile.start} <-> ${d.secondFile.name}:${d.secondFile.start}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const limits = JSON.parse(
    fs.readFileSync(path.join(root, "config/gates/quality-limits.json"), "utf8"),
  ).dup;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "jscpd-"));
  const run = spawnSync(
    "npx",
    [
      "--no-install",
      "jscpd",
      "--config",
      ".jscpd.json",
      "--reporters",
      "json",
      "--output",
      out,
      "--silent",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const file = path.join(out, "jscpd-report.json");
  if (!fs.existsSync(file)) {
    console.error(`QG-K5: jscpd failed\n${run.stdout}${run.stderr}`);
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.rmSync(out, { recursive: true, force: true });
  const total = report.statistics.total;
  const percent = total.percentage;
  console.log(
    `QG-K5: ${percent.toFixed(2)} % duplicated lines (${total.duplicatedLines} of ${total.lines}, ${total.clones} clones), limit ${limits.maxPercent} %, target ${TARGET_PERCENT} %`,
  );
  const errors = checkDup(percent, limits);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`Biggest clones:\n${biggest(report).join("\n")}`);
    process.exit(1);
  }
}
