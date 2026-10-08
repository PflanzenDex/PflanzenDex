// QG-C4 file layout gate (US-QG-09, FR-QG-21, FR-QG-22). Rules LY-1 to LY-6; config: app/config/lint/layout.config.mjs.
//   node tools/check/code/layout/check-layout.mjs                  check against app/config/gates/baselines/layout-baseline.json
//   node tools/check/code/layout/check-layout.mjs --write-baseline create the baseline (an empty {} counts as none), or lower it; never enlarge it
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../../../../config/lint/layout.config.mjs";
import { compareBaseline, toBaseline } from "./layout-baseline.mjs";
import { findLayout } from "./layout-rules.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const root = path.resolve(app, "..");
export const BASELINE_FILE = path.join(app, "config/gates/baselines/layout-baseline.json");
const devRef = process.env.LAYOUT_BASE ?? "origin/dev";

const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
// -z keeps paths with spaces or non-ASCII characters unquoted.
const names = (cwd, ...args) =>
  git(cwd, ...args, "-z")
    .split("\0")
    .filter(Boolean);

// Tracked and not-yet-tracked files, without files deleted in the working tree.
export function listPaths(cwd = root) {
  const deleted = new Set(names(cwd, "ls-files", "--deleted"));
  const all = [
    ...names(cwd, "ls-files", "--cached"),
    ...names(cwd, "ls-files", "--others", "--exclude-standard"),
  ];
  return [...new Set(all)].filter((p) => !deleted.has(p));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (error) {
    console.error(`check-layout: ${BASELINE_FILE} is not valid JSON (${error.message})`);
    return process.exit(1);
  }
}

// The baseline on dev; undefined while dev has none (first PR). In CI a missing ref is an error (LY-6).
function devBaseline() {
  try {
    git(root, "rev-parse", "--verify", "--quiet", devRef);
  } catch {
    if (process.env.CI) {
      console.error(`check-layout: ${devRef} is not fetched; CI must fetch it (LY-6)`);
      process.exit(1);
    }
    console.warn(
      `check-layout: ${devRef} not found, skipping the "baseline must not grow" comparison`,
    );
    return undefined;
  }
  try {
    return JSON.parse(
      git(root, "show", `${devRef}:app/config/gates/baselines/layout-baseline.json`),
    );
  } catch {
    return undefined;
  }
}

function main() {
  const findings = findLayout(listPaths(), config);
  const baseline = readBaseline();
  if (process.argv.includes("--write-baseline")) {
    // An empty baseline counts as "none yet", so the file can exist before the first write.
    const known = baseline && Object.keys(baseline).length > 0;
    const worse = known
      ? compareBaseline(findings, baseline).filter((e) => !e.startsWith("LY-6"))
      : [];
    if (worse.length) {
      console.error(`check-layout: refusing to enlarge the baseline:\n${worse.join("\n")}`);
      process.exit(1);
    }
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(toBaseline(findings), null, 2)}\n`);
    console.log(`check-layout: wrote ${BASELINE_FILE} (${findings.length} directories)`);
    return;
  }
  const errors = compareBaseline(findings, baseline ?? {}, devBaseline());
  if (errors.length) {
    console.error(
      `check-layout: ${errors.length} problem(s)\n${errors.map((e) => `  ${e}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`check-layout: OK (${findings.length} baselined directories)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
