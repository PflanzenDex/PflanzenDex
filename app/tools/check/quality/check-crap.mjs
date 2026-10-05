// CRAP gate (QG-K3, FR-QG-18): risk = complexity x missing tests, per function, blocking on changed code.
// CRAP = comp^2 * (1 - cov)^3 + comp. Complexity and CRAP come from `fallow health` (fixed devDependency),
// per-function coverage from the Istanbul maps (coverage-final.json) that `npm run coverage` writes per package.
// Functions in files without coverage data are scored with fallow's conservative estimate.
// Usage: node tools/check/quality/check-crap.mjs [--all]   (--all: whole project instead of files changed vs. the base)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The threshold lives in quality-limits.json (`crap.max`, FR-QG-16/18); a function above it fails. */
export function readMaxCrap(file = new URL("../../../quality-limits.json", import.meta.url)) {
  return JSON.parse(fs.readFileSync(file, "utf8")).crap.max;
}

export const MAX_CRAP = readMaxCrap();

/** Merge Istanbul coverage maps; the keys are absolute file paths, so a plain merge is lossless. */
export function mergeCoverage(maps) {
  return Object.assign({}, ...maps);
}

/** Arguments for `fallow health`: only CRAP is judged; the plain complexity limits are switched off. */
export function fallowArgs({ coverageDir, base }) {
  const args = ["health", "--complexity", "--format", "json", "--quiet"];
  // Report every function from CRAP 1 up; the threshold is applied in `findOffenders`.
  args.push("--max-crap", "1", "--max-cyclomatic", "65535", "--max-cognitive", "65535");
  if (coverageDir) args.push("--coverage", coverageDir);
  if (base) args.push("--changed-since", base);
  return args;
}

/** Findings with a CRAP score above the threshold, worst first. */
export function findOffenders(report, max = MAX_CRAP) {
  return (report.findings ?? [])
    .filter((f) => typeof f.crap === "number" && f.crap > max)
    .sort((a, b) => b.crap - a.crap);
}

export function maxCrap(report) {
  return Math.max(0, ...(report.findings ?? []).map((f) => f.crap ?? 0));
}

export function formatOffender(f) {
  const src = f.coverage_source === "istanbul" ? `coverage ${f.coverage_pct}%` : "no coverage data";
  return `${f.path}:${f.line} ${f.name}: CRAP ${f.crap} (cyclomatic ${f.cyclomatic}, ${src})`;
}

/** Diff base: the PR base branch in CI, otherwise origin/dev; null (= whole project) if it does not resolve. */
export function resolveBase(env, refExists) {
  const ref = `origin/${env.GITHUB_BASE_REF || "dev"}`;
  return refExists(ref) ? ref : null;
}

function writeMergedCoverage(root) {
  const maps = [];
  const pkgs = path.join(root, "packages");
  for (const pkg of fs.readdirSync(pkgs)) {
    const file = path.join(pkgs, pkg, "coverage", "coverage-final.json");
    if (fs.existsSync(file)) maps.push(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  if (!maps.length) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crap-"));
  fs.writeFileSync(path.join(dir, "coverage-final.json"), JSON.stringify(mergeCoverage(maps)));
  return dir;
}

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const all = process.argv.includes("--all");
  const refExists = (ref) =>
    spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: root }).status === 0;
  const base = all ? null : resolveBase(process.env, refExists);
  const coverageDir = writeMergedCoverage(root);
  if (!coverageDir) console.log("note: no coverage-final.json found; all scores are estimates");
  const run = spawnSync("npx", ["fallow", ...fallowArgs({ coverageDir, base })], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (coverageDir) fs.rmSync(coverageDir, { recursive: true, force: true });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    console.error(`FAIL: fallow produced no JSON (exit ${run.status})\n${run.stderr}`);
    process.exit(1);
  }
  if (report.error) {
    console.error(`FAIL: fallow error: ${report.message}`);
    process.exit(1);
  }
  const scope = base ? `functions in files changed vs. ${base}` : "all functions";
  const offenders = findOffenders(report);
  console.log(`CRAP (${scope}): max ${maxCrap(report)}, limit ${MAX_CRAP}`);
  for (const f of offenders) console.error(`FAIL: ${formatOffender(f)}`);
  if (offenders.length) process.exit(1);
  console.log("crap: ok");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
