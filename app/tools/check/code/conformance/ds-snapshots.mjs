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
import { baselineFindings, expectedBaselines, snapshotStoryIds } from "./ds-snapshots.lib.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const baselineDir = path.join(appRoot, "packages", "web", ".storybook", "snapshots");
export const resultsDir = path.join(appRoot, ".cache", "ds-snapshots-results");

/** The image is derived from the installed Playwright, so browser and library can never drift apart. */
export function playwrightImage() {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(appRoot, "node_modules", "playwright", "package.json"), "utf8"),
  );
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Builds the catalog, renders its stories in the container and returns { status, findings }. */
export function runCatalog({
  fixtures = false,
  snapshotDir = baselineDir,
  outputDir = resultsDir,
  storyArgs = "",
  update = false,
} = {}) {
  const catalog = fs.mkdtempSync(path.join(os.tmpdir(), "ds-snapshots-"));
  try {
    buildCatalog(catalog, fixtures);
    const index = JSON.parse(fs.readFileSync(path.join(catalog, "index.json"), "utf8"));
    const ids = snapshotStoryIds(index, { fixtures });
    if (ids.length === 0) throw new Error("QG-U5: no stories to snapshot");
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(snapshotDir, { recursive: true });
    if (update)
      for (const f of fs.readdirSync(snapshotDir))
        if (f.endsWith(".png")) fs.rmSync(path.join(snapshotDir, f));
    const env = (k, v) => ["-e", `${k}=${v}`];
    const r = spawnSync(
      "docker",
      [
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
        `${snapshotDir}:/snapshots`,
        "-v",
        `${outputDir}:/out`,
        ...env("DS_CATALOG", "/catalog"),
        ...env("DS_SNAPSHOT_DIR", "/snapshots"),
        ...env("DS_OUTPUT_DIR", "/out/results"),
        ...env("DS_STORIES", JSON.stringify(ids)),
        ...env("DS_STORY_ARGS", storyArgs),
        ...env("DS_UPDATE", update ? "1" : "0"),
        ...env("HOME", "/tmp"),
        playwrightImage(),
        "node",
        "/work/app/tools/check/code/conformance/ds-snapshots.container.mjs",
      ],
      { stdio: "inherit" },
    );
    const findings = update
      ? []
      : baselineFindings(expectedBaselines(ids), fs.readdirSync(snapshotDir));
    return { status: r.status ?? 1, findings, ids };
  } finally {
    fs.rmSync(catalog, { recursive: true, force: true });
  }
}

function main() {
  const update = process.argv.includes("--update");
  const { status, findings, ids } = runCatalog({ update });
  if (update) {
    console.log(
      `QG-U5 snapshots: ${status === 0 ? "baselines written" : "failed"} for ${ids.length} stories in app/packages/web/.storybook/snapshots; review the images and commit them`,
    );
    process.exit(status);
  }
  if (findings.length > 0) console.error(findings.join("\n"));
  if (status !== 0)
    console.error(
      `\nQG-U5 snapshots: screenshots differ; diff images are in ${path.relative(appRoot, resultsDir)}. If the change is intended run \`make ds-snapshots\` and commit the new baselines.`,
    );
  if (status !== 0 || findings.length > 0) process.exit(1);
  console.log(`QG-U5 snapshots: ok (${ids.length} stories x 2 schemes)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
