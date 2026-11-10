// Visual regression of the component catalog (QG-U5, US-QS-07; owner decision: Playwright screenshots, baselines in
// git, no hosted service). Builds the catalog on the host, then renders it in the PINNED Playwright container so
// that the pictures are identical on a laptop and in CI (same browser build, same fonts).
// Usage: node tools/check/code/conformance/ds-snapshots.mjs            compare with the baselines in app/packages/web/.storybook/snapshots (CI, `make ds-snapshots-check`)
//        node tools/check/code/conformance/ds-snapshots.mjs --update   rewrite the baselines (`make ds-snapshots`; never run in CI)
// Self-test hooks (ds-snapshots.selftest.mjs): runCatalog({ fixtures, snapshotDir, storyArgs, update }).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./check-conformance.mjs";
import {
  baselineFindings,
  expectedBaselines,
  expectedPageBaselines,
  pageStoryIds,
  quarantineFindings,
  snapshotStoryIds,
} from "./ds-snapshots.lib.mjs";

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
export const resultsDir = path.join(appRoot, ".cache", "ds-snapshots-results");

/** The image is derived from the installed Playwright, so browser and library can never drift apart. */
export function playwrightImage() {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(appRoot, "node_modules", "playwright", "package.json"), "utf8"),
  );
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Creates the baseline directories; an update starts from empty ones, so removed stories leave no stale picture. */
function prepare(dirs, update) {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    if (update) for (const f of pngs(dir)) fs.rmSync(path.join(dir, f));
  }
}

const pngs = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".png"));

/** The `docker run` arguments: the app read-only, the catalog, both baseline directories and the results. */
function dockerArgs({
  catalog,
  ids,
  pages,
  skipped,
  snapshotDir,
  pageSnapshotDir,
  outputDir,
  storyArgs,
  update,
}) {
  const env = (k, v) => ["-e", `${k}=${v}`];
  return [
    "run",
    "--rm",
    "--init",
    "--ipc=host",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "-v",
    `${appRoot}:/work/app:ro`,
    "-v",
    `${catalog}:/catalog:ro`,
    "-v",
    `${snapshotDir}:/snapshots/ui`,
    "-v",
    `${pageSnapshotDir}:/snapshots/pages`,
    "-v",
    `${outputDir}:/out`,
    ...env("DS_CATALOG", "/catalog"),
    ...env("DS_SNAPSHOT_DIR", "/snapshots"),
    ...env("DS_OUTPUT_DIR", "/out/results"),
    ...env("DS_STORIES", JSON.stringify(ids)),
    ...env("DS_PAGES", JSON.stringify(pages)),
    ...env("DS_QUARANTINE", JSON.stringify(skipped)),
    ...env("DS_STORY_ARGS", storyArgs),
    ...env("DS_UPDATE", update ? "1" : "0"),
    ...env("DS_WORKERS", WORKERS),
    ...env("HOME", "/tmp"),
    playwrightImage(),
    "node",
    "/work/app/tools/check/code/conformance/ds-snapshots.container.mjs",
  ];
}

/** Builds the catalog, renders its ui stories and page states in the container; returns { status, findings, ids }. */
export function runCatalog({
  fixtures = false,
  snapshotDir = baselineDir,
  pageSnapshotDir = pageBaselineDir,
  quarantine,
  outputDir = resultsDir,
  storyArgs = "",
  update = false,
} = {}) {
  const q = quarantine ?? (fixtures ? { maxEntries: 0, entries: [] } : readQuarantine());
  const catalog = catalogFor(fixtures);
  try {
    const run = { catalog, fixtures, quarantine: q, snapshotDir, pageSnapshotDir };
    return render({ ...run, outputDir, storyArgs, update });
  } catch (error) {
    fs.rmSync(catalog, { recursive: true, force: true });
    built.delete(fixtures);
    throw error;
  }
}

function render(run) {
  const { catalog, fixtures, quarantine, snapshotDir, pageSnapshotDir, outputDir } = run;
  const index = JSON.parse(fs.readFileSync(path.join(catalog, "index.json"), "utf8"));
  const ids = snapshotStoryIds(index, { fixtures });
  const pages = pageStoryIds(index, { fixtures });
  if (ids.length === 0 || pages.length === 0) throw new Error("QG-U5: no stories to snapshot");
  const skipped = quarantine.entries.map((e) => e.file);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  prepare([snapshotDir, pageSnapshotDir], run.update);
  const r = spawnSync("docker", dockerArgs({ ...run, ids, pages, skipped }), { stdio: "inherit" });
  const findings = run.update
    ? []
    : [
        ...baselineFindings(expectedBaselines(ids), pngs(snapshotDir)),
        ...baselineFindings(expectedPageBaselines(pages, skipped), pngs(pageSnapshotDir)),
        ...quarantineFindings(quarantine, pages),
      ];
  return { status: r.status ?? 1, findings, ids, pages };
}

const readQuarantine = () => JSON.parse(fs.readFileSync(quarantineFile, "utf8"));

// Each catalog (with or without the self-test fixtures) is built once per process and reused: the self-test called
// runCatalog five times and rebuilt Storybook every time, though only story args change (issue 1124). The catalogs
// are removed when the process exits.
const built = new Map();
function catalogFor(fixtures) {
  if (!built.has(fixtures)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-snapshots-"));
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
      `QG-U5 snapshots: ${status === 0 ? "baselines written" : "failed"} for ${ids.length} ui stories (app/packages/web/.storybook/snapshots) and ${pages.length} page states (.storybook/page-snapshots); review the images and commit them`,
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

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
