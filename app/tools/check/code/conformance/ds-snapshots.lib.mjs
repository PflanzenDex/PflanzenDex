// Pure helpers of the QG-U5 visual regression (US-QS-07): which stories are snapshotted, what the baseline file
// names are, and which baselines are missing or stale. No browser and no Docker in here, so they are unit tested.
export const SCHEMES = ["light", "dark"];
export const VIEWPORT = { width: 360, height: 640 };
export const UI_IMPORT = "./src/components/ui/";
export const FIXTURE_PREFIX = "ds-snapshot-fixture-";
export const PAGE_IMPORT = "./src/lib/page-stories/";
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

/** Ids of the stories that are snapshotted: `components/ui` only (or only the self-test fixture). */
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
