// Visual regression of the component catalog (QG-U5, US-QS-07; owner decision: Playwright screenshots, baselines in
// git, no hosted service). Builds the catalog on the host, then renders it in the PINNED Playwright container so
// that the pictures are identical on a laptop and in CI (same browser build, same fonts).
// Usage: node tools/check/code/conformance/ds-snapshots.mjs            compare with the baselines in app/packages/web/.storybook/snapshots (CI, `make ds-snapshots-check`)
//        node tools/check/code/conformance/ds-snapshots.mjs --update   rewrite the baselines (`make ds-snapshots`; never run in CI)
// Self-test hooks (ds-snapshots.selftest.mjs): runCatalog({ fixtures, snapshotDir, storyArgs, update, docker }); `docker`
// is the container command ("false" makes a run fail).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./check-conformance.mjs";
import {
  baselineFindings,
  dockerArgs,
  expectedBaselines,
  expectedPageBaselines,
  pageStoryIds,
  quarantineFindings,
  replacePngs,
  seedStaging,
  snapshotStoryIds,
} from "./ds-snapshots.lib.mjs";
import { isEntryPoint } from "../../shared/entry-point.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const baselineDir = path.join(appRoot, "packages", "web", ".storybook", "snapshots");
export const pageBaselineDir = path.join(
  appRoot,
  "packages",
  "web",
  ".storybook",
  "page-snapshots",
);
export const quarantineFile = path.join(
  appRoot,
  "config",
  "gates",
  "baselines",
  "page-snapshots-baseline.json",
);
// Scratch folders live under app/.cache: Colima and Docker Desktop share only $HOME into their VM, so a folder under
// os.tmpdir() (/var/folders on macOS) is mounted empty (issue 2286).
const scratchRoot = path.join(appRoot, ".cache");
export const resultsDir = path.join(scratchRoot, "ds-snapshots-results");

/** A new scratch folder under app/.cache. */
export function scratchDir(prefix) {
  fs.mkdirSync(scratchRoot, { recursive: true });
  return fs.mkdtempSync(path.join(scratchRoot, prefix));
}

/** The image is derived from the installed Playwright, so browser and library can never drift apart. */
export function playwrightImage() {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(appRoot, "node_modules", "playwright", "package.json"), "utf8"),
  );
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Creates the baseline directories; an update swaps its pictures in once the run passed (see render). */
function prepare(dirs) {
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

const pngs = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".png"));

/**
 * Builds the catalog, renders its ui stories and page states in the container. Returns { status, findings, ids, pages,
 * catalog }. An update renders into staging folders and replaces the baselines only when the run exits 0 (issue 2286).
 */
export function runCatalog({
  fixtures = false,
  snapshotDir = baselineDir,
  pageSnapshotDir = pageBaselineDir,
  quarantine,
  outputDir = resultsDir,
  storyArgs = "",
  update = false,
  docker = "docker",
} = {}) {
  const q = quarantine ?? (fixtures ? { maxEntries: 0, entries: [] } : readQuarantine());
  const catalog = catalogFor(fixtures);
  try {
    const run = { catalog, fixtures, quarantine: q, snapshotDir, pageSnapshotDir, docker };
    return { ...render({ ...run, outputDir, storyArgs, update }), catalog };
  } catch (error) {
    fs.rmSync(catalog, { recursive: true, force: true });
    built.delete(fixtures);
    throw error;
  }
}

const STAGING = "ds-snapshots-staging-";
const stage = () => scratchDir(STAGING);

function render(run) {
  const { catalog, fixtures, quarantine, snapshotDir, pageSnapshotDir, outputDir, update, docker } =
    run;
  const index = JSON.parse(fs.readFileSync(path.join(catalog, "index.json"), "utf8"));
  const ids = snapshotStoryIds(index, { fixtures });
  const pages = pageStoryIds(index, { fixtures });
  if (ids.length === 0 || pages.length === 0) throw new Error("QG-U5: no stories to snapshot");
  const skipped = quarantine.entries.map((e) => e.file);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  prepare([snapshotDir, pageSnapshotDir]);
  // An update renders into staging folders: the baselines are replaced only after a passing run, so a failed
  // `make ds-snapshots` leaves the committed pictures as they were (issue 2286). The staging folders start with the
  // committed pictures of the stories that still render, and the run writes only the ones that fail or are missing,
  // so a picture that differs below the tolerance keeps its file (issue 2641).
  const staged = update ? { snapshotDir: stage(), pageSnapshotDir: stage() } : null;
  if (staged) {
    seedStaging(snapshotDir, staged.snapshotDir, expectedBaselines(ids));
    seedStaging(pageSnapshotDir, staged.pageSnapshotDir, expectedPageBaselines(pages, skipped));
  }
  try {
    const args = dockerArgs({
      ...run,
      ...(staged ?? { snapshotDir, pageSnapshotDir }),
      ids,
      pages,
      skipped,
      appRoot,
      image: playwrightImage(),
      workers: WORKERS,
    });
    const r = spawnSync(docker, args, { stdio: "inherit" });
    const status = r.status ?? 1;
    if (staged && status === 0) {
      replacePngs(staged.snapshotDir, snapshotDir);
      replacePngs(staged.pageSnapshotDir, pageSnapshotDir);
    }
    const findings = update
      ? []
      : [
          ...baselineFindings(expectedBaselines(ids), pngs(snapshotDir)),
          ...baselineFindings(expectedPageBaselines(pages, skipped), pngs(pageSnapshotDir)),
          ...quarantineFindings(quarantine, pages),
        ];
    return { status, findings, ids, pages };
  } finally {
    for (const dir of Object.values(staged ?? {})) fs.rmSync(dir, { recursive: true, force: true });
  }
}

const readQuarantine = () => JSON.parse(fs.readFileSync(quarantineFile, "utf8"));

// Each catalog (with or without the self-test fixtures) is built once per process and reused: the self-test called
// runCatalog five times and rebuilt Storybook every time, though only story args change (issue 1124). The catalogs
// are removed when the process exits.
const built = new Map();
function catalogFor(fixtures) {
  if (!built.has(fixtures)) {
    const dir = scratchDir("ds-snapshots-");
    buildCatalog(dir, fixtures);
    built.set(fixtures, dir);
  }
  return built.get(fixtures);
}
process.on("exit", () => {
  for (const dir of built.values()) fs.rmSync(dir, { recursive: true, force: true });
});

// Screenshots on this many Playwright workers in the container. Measured (issue 1120): 92 shots take 20-24 s on 4
// workers instead of 59 s on one, and every baseline still matches.
const WORKERS = process.env.DS_WORKERS ?? "4";

function main() {
  const update = process.argv.includes("--update");
  const { status, findings, ids, pages } = runCatalog({ update });
  if (update) {
    console.log(
      `QG-U5 snapshots: ${status === 0 ? "baselines written" : "failed, the baselines are unchanged"} for ${ids.length} ui stories (app/packages/web/.storybook/snapshots) and ${pages.length} page states (.storybook/page-snapshots); review the images and commit them`,
    );
    process.exit(status);
  }
  if (findings.length > 0) console.error(findings.join("\n"));
  if (status !== 0)
    console.error(
      `\nQG-U5 snapshots: screenshots differ; diff images are in ${path.relative(appRoot, resultsDir)}. If the change is intended run \`make ds-snapshots\` and commit the new baselines.`,
    );
  if (status !== 0 || findings.length > 0) process.exit(1);
  console.log(
    `QG-U5 snapshots: ok (${ids.length} ui stories x 2 schemes, ${pages.length} page states x 5 sizes x 2 schemes)`,
  );
}

if (isEntryPoint(import.meta.url)) main();
