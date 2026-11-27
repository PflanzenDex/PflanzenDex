// Pure helpers of the QG-U5 visual regression (US-QS-07): which stories are snapshotted, what the baseline file
// names are, which baselines are missing or stale, and the `docker run` arguments. No browser and no Docker run in
// here, so they are unit tested; replacePngs is the one file operation (a move inside a folder), unit tested on a temp
// folder.
import fs from "node:fs";
import path from "node:path";
export const SCHEMES = ["light", "dark"];
export const VIEWPORT = { width: 360, height: 640 };
export const UI_IMPORT = "./src/shared/ui/";
export const FIXTURE_PREFIX = "ds-snapshot-fixture-";
export const PAGE_IMPORT = "./src/app/stories/";
export const PAGE_FIXTURE_PREFIX = "ds-snapshot-fixture-page";
/** Dark and desktop variants of a page story (`variants()`): they set their own globals and are no pages of their own. */
export const PAGE_VARIANT_ID = /-(phone-dark|desktop|desktop-dark)$/;
/** The US-QS-15 sizes without the 2560 px width cap check (FR-QG-27). */
export const PAGE_SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

/** Ids of the stories that are snapshotted: `shared/ui` only (or only the self-test fixture). */
export function snapshotStoryIds(index, { fixtures = false } = {}) {
  return Object.values(index.entries)
    .filter((e) => e.type === "story")
    .filter((e) =>
      fixtures
        ? e.id.startsWith(FIXTURE_PREFIX) && !e.id.startsWith(PAGE_FIXTURE_PREFIX)
        : e.importPath.startsWith(UI_IMPORT),
    )
    .map((e) => e.id)
    .sort();
}

/** Ids of the page states (FR-QG-27): page stories that are no variants (or the page fixture of the self-test). */
export function pageStoryIds(index, { fixtures = false } = {}) {
  return Object.values(index.entries)
    .filter((e) => e.type === "story")
    .filter((e) =>
      fixtures
        ? e.id.startsWith(PAGE_FIXTURE_PREFIX)
        : e.importPath.startsWith(PAGE_IMPORT) && !PAGE_VARIANT_ID.test(e.id),
    )
    .map((e) => e.id)
    .sort();
}

export const pageBaselineName = (id, { width, height }, scheme) =>
  `${id}--${width}x${height}--${scheme}.png`;

/** All baselines of the page states; quarantined files are left out (they are skipped and have no picture). */
export function expectedPageBaselines(ids, quarantined = []) {
  const skip = new Set(quarantined);
  return ids
    .flatMap((id) =>
      SCHEMES.flatMap((scheme) => PAGE_SIZES.map((size) => pageBaselineName(id, size, scheme))),
    )
    .filter((f) => !skip.has(f));
}

/** The quarantine ratchet (FR-QG-17): it only shrinks, and an entry must name a picture that is still produced. */
export function quarantineFindings(baseline, ids) {
  const all = new Set(expectedPageBaselines(ids));
  const stale = baseline.entries
    .filter((e) => !all.has(e.file))
    .map((e) => `QG-U5 ${e.file}: quarantine entry names a picture no page renders, remove it`);
  const grown =
    baseline.entries.length > baseline.maxEntries
      ? [
          `QG-U5 page-snapshots-baseline.json has ${baseline.entries.length} entries, maxEntries is ${baseline.maxEntries} (never raise it)`,
        ]
      : [];
  return [...grown, ...stale];
}

export const baselineName = (id, scheme) => `${id}--${scheme}.png`;

export function expectedBaselines(ids) {
  return ids.flatMap((id) => SCHEMES.map((scheme) => baselineName(id, scheme)));
}

/**
 * The `docker run` arguments: the app read-only, the catalog, both baseline folders (the staging folders of an update)
 * and the results. The image, the worker count and the app root come in as arguments.
 */
export function dockerArgs({
  appRoot,
  image,
  workers,
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
    ...env("DS_WORKERS", workers),
    ...env("HOME", "/tmp"),
    image,
    "node",
    "/work/app/tools/check/code/conformance/ds-snapshots.container.mjs",
  ];
}

/**
 * The Playwright update mode: an update writes only the pictures that fail the comparison or are missing ("changed"),
 * so pictures that differ below the tolerance keep their committed file (issue 2641); a check writes nothing.
 */
export function updateMode(update) {
  return update ? "changed" : "none";
}

/**
 * An update starts from the committed pictures: the staging folder gets a copy of each expected baseline that exists,
 * so the "changed" mode compares against them and rewrites only what fails. Stale pictures (no story renders them) are
 * not copied, so replacePngs still removes them (issue 2641).
 */
export function seedStaging(baselineDir, stagedDir, expected) {
  fs.mkdirSync(stagedDir, { recursive: true });
  for (const f of expected) {
    const from = path.join(baselineDir, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(stagedDir, f));
  }
}

/**
 * An update that passed: the staged pictures move into the baseline folder (over the old file of the same name), the
 * old pictures that no story renders any more are removed, and every other file stays (issue 2286). Staged files go
 * in first, so no picture is missing in between.
 */
export function replacePngs(stagedDir, baselineDir) {
  fs.mkdirSync(baselineDir, { recursive: true });
  const isPng = (f) => f.endsWith(".png");
  const fresh = fs.readdirSync(stagedDir).filter(isPng);
  for (const f of fresh) fs.renameSync(path.join(stagedDir, f), path.join(baselineDir, f));
  const keep = new Set(fresh);
  for (const f of fs.readdirSync(baselineDir).filter(isPng))
    if (!keep.has(f)) fs.rmSync(path.join(baselineDir, f));
}

/** Compares the expected baseline names with the files in the baseline directory. */
export function baselineFindings(expected, present) {
  const have = new Set(present.filter((f) => f.endsWith(".png")));
  const want = new Set(expected);
  return [
    ...[...want]
      .filter((f) => !have.has(f))
      .sort()
      .map((f) => `QG-U5 ${f}: story has no baseline (run \`make ds-snapshots\`)`),
    ...[...have]
      .filter((f) => !want.has(f))
      .sort()
      .map((f) => `QG-U5 ${f}: stale baseline, no story renders it (run \`make ds-snapshots\`)`),
  ];
}
