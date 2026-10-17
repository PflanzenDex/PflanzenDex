// Duplicate detection (QG-K4) with Fallow `dupes`. Thresholds live once in quality-limits.json ("duplicates", FR-QG-18).
// Two runs: the whole project is only reported (informational), the diff against the base is blocking (B on diff):
// a clone group with at least `minOccurrences` instances that touches a file changed since the base fails the check.
// Base: DUPLICATES_BASE, else origin/$GITHUB_BASE_REF (CI pull request), else origin/dev.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function fallowArgs(limits, extra = []) {
  return [
    "fallow",
    "dupes",
    "--min-occurrences",
    String(limits.minOccurrences),
    "--min-tokens",
    String(limits.minTokens),
    "--min-lines",
    String(limits.minLines),
    "--mode",
    limits.mode,
    ...extra,
  ];
}

export function baseRef(env) {
  if (env.DUPLICATES_BASE) return env.DUPLICATES_BASE;
  return `origin/${env.GITHUB_BASE_REF || "dev"}`;
}

// Fallow's exit code does not reflect clone groups, so the verdict comes from the JSON report.
export function cloneGroups(json) {
  return JSON.parse(json).clone_groups ?? [];
}

export function describe(groups) {
  return groups.map(
    (g) =>
      `  ${g.line_count} lines x${g.instances.length}: ` +
      g.instances.map((i) => `${i.file}:${i.start_line}-${i.end_line}`).join(", "),
  );
}

const npx = (args, stdio) =>
  spawnSync("npx", ["--no-install", ...args], { encoding: "utf8", stdio });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const limits = JSON.parse(
    fs.readFileSync(
      new URL("../../../../config/gates/quality-limits.json", import.meta.url),
      "utf8",
    ),
  ).duplicates;
  const base = baseRef(process.env);
  if (spawnSync("git", ["rev-parse", "--verify", "--quiet", base]).status !== 0) {
    console.error(`QG-K4: base ${base} not found; fetch it or set DUPLICATES_BASE.`);
    process.exit(2);
  }
  const report = (extra) =>
    npx(fallowArgs(limits, ["--format", "json", "--no-fragments", "--quiet", ...extra]), "pipe");
  const all = report([]);
  const diff = report(["--changed-since", base]);
  if (all.status !== 0 || diff.status !== 0) {
    console.error(`QG-K4: fallow failed\n${all.stderr}${diff.stderr}`);
    process.exit(2);
  }
  const whole = cloneGroups(all.stdout);
  console.log(`QG-K4 whole project (report only): ${whole.length} clone group(s)`);
  console.log(describe(whole).join("\n"));
  const changed = cloneGroups(diff.stdout);
  console.log(`QG-K4 changed since ${base} (blocking): ${changed.length} clone group(s)`);
  if (changed.length > 0) {
    console.error(describe(changed).join("\n"));
    console.error(
      `QG-K4: duplicated code in changed files (at least ${limits.minOccurrences} copies). Extract it.`,
    );
    process.exit(1);
  }
}
