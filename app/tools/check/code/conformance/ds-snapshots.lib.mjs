// Pure helpers of the QG-U5 visual regression (US-QS-07): which stories are snapshotted, what the baseline file
// names are, and which baselines are missing or stale. No browser and no Docker in here, so they are unit tested.
export const SCHEMES = ["light", "dark"];
export const VIEWPORT = { width: 360, height: 640 };
export const UI_IMPORT = "./src/components/ui/";
export const FIXTURE_PREFIX = "ds-snapshot-fixture-";

/** Ids of the stories that are snapshotted: `components/ui` only (or only the self-test fixture). */
export function snapshotStoryIds(index, { fixtures = false } = {}) {
  return Object.values(index.entries)
    .filter((e) => e.type === "story")
    .filter((e) =>
      fixtures ? e.id.startsWith(FIXTURE_PREFIX) : e.importPath.startsWith(UI_IMPORT),
    )
    .map((e) => e.id)
    .sort();
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
      .map((f) => `QG-U5 ${f}: stale baseline, no ui story renders it (run \`make ds-snapshots\`)`),
  ];
}
