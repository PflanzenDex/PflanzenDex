// The baseline of the one-screen gate (FR-QG-17, it only shrinks; issue 1137, QG-U8): how a run is compared with it, how
// a full run rewrites it, and when a screen was not measured at all because the sign-in was lost. Pure, no browser.
import type { Baseline, BaselineEntry, Result } from "./judge";

/** A listed screen may not get worse by more than this ratio, or this many pixels for the width cap. */
const WORSE_RATIO = 0.02;
const WORSE_PX = 2;
/** Borderline values move by hundredths between runs (2026-11-02): an entry this close to the limit that fits once is noise. */
const STALE_MARGIN = 0.03;

export const entryOf = (baseline: Baseline, r: Result) =>
  baseline.entries.find((e) => e.screen === r.screen && e.size === r.size);

// At 200 % text only the region may scroll (DS-61), so its inner ratio is no criterion there and is not compared.
function worse(r: Result, e: BaselineEntry): string | null {
  const parts: string[] = [];
  const textRun = r.size.endsWith("@200%");
  if (r.page > e.page + WORSE_RATIO) parts.push(`page ${r.page} > ${e.page}`);
  if (!textRun && r.inner > e.inner + WORSE_RATIO) parts.push(`inner ${r.inner} > ${e.inner}`);
  if (r.hOver > (e.hOver ?? 0)) parts.push(`sideways ${r.hOver} px > ${e.hOver ?? 0} px`);
  if (r.cap > (e.cap ?? 0) + WORSE_PX) parts.push(`cap ${r.cap} px > ${e.cap ?? 0} px`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Whether a listed entry was clearly over the limit, so that fitting now means it was fixed, not noise. */
const clearlyOver = (e: BaselineEntry) =>
  (e.cap ?? 0) > 0 || (e.hOver ?? 0) > 0 || Math.max(e.page, e.inner) > 1 + STALE_MARGIN;

/** The violations of one screen against the baseline: new failures, listed ones that got worse, listed ones that fit now. */
export function judgeScreen(
  results: readonly Result[],
  baseline: Baseline,
  unstable = false,
): string[] {
  return results.flatMap((r) => {
    const label = `${r.screen} at ${r.size}`;
    const entry = entryOf(baseline, r);
    if (r.failures.length === 0)
      return entry && !unstable && clearlyOver(entry)
        ? [`${label}: fits now, remove it from the baseline (npm run one-screen:write)`]
        : [];
    if (!entry) return [`${label}: ${r.failures.join("; ")}`];
    const got = worse(r, entry);
    return got ? [`${label}: worse than the baseline (${got}): ${r.failures.join("; ")}`] : [];
  });
}

/** The baseline itself only shrinks: more entries than `maxEntries`, or entries of screens or sizes that do not exist any more. */
export function judgeBaseline(
  baseline: Baseline,
  screens: ReadonlySet<string>,
  sizes: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  if (baseline.entries.length > baseline.maxEntries)
    problems.push(
      `baseline has ${baseline.entries.length} entries, maxEntries is ${baseline.maxEntries}: it only shrinks (FR-QG-17)`,
    );
  for (const e of baseline.entries) {
    if (!screens.has(e.screen)) problems.push(`baseline names the unknown screen ${e.screen}`);
    if (!sizes.has(e.size)) problems.push(`baseline names the unknown size ${e.size}`);
  }
  return problems;
}

/** The baseline a full run would write: every failing screen and size with its measured values. */
export function buildBaseline(results: readonly Result[]): Baseline {
  const entries = results
    .filter((r) => r.failures.length > 0)
    .map((r): BaselineEntry => {
      const e: BaselineEntry = { screen: r.screen, size: r.size, page: r.page, inner: r.inner };
      if (r.hOver > 0) e.hOver = r.hOver;
      if (r.cap > 0) e.cap = r.cap;
      return e;
    });
  return { maxEntries: entries.length, entries };
}

/** A lost sign-in sends the app to Heute or the welcome page; measuring that would pass silently (P-10), so name it. */
export function lostScreen(wantedUrl: string, landedUrl: string): string | null {
  const wanted = new URL(wantedUrl).pathname;
  const landed = new URL(landedUrl).pathname;
  if (wanted === "/" || wanted.startsWith("/today")) return null;
  if (landed !== "/" && !landed.startsWith("/today")) return null;
  return `opened ${wanted} but landed on ${landed} (signed out?)`;
}
