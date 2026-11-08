// The judgement of the layout-shift check of the one-screen project (US-QS-14, DS-52, issue 1697): what the cumulative
// layout shift of a cold load means, its limit, and how it compares with the baseline (FR-QG-17). Pure, no browser, so the
// self-test in tests/accessibility/routes/one-screen.shift.ts runs without one. A display tolerance: loosening it turns a
// red run green (US-QG-07). The browser side that records the shifts is fit.shift.ts.
import { readFileSync } from "node:fs";
import type { Size } from "./judge";

/** Cold loads at these sizes, every screen at each of them (owner decision 2026-11-08). Not SIZES: its counts stay. */
export const SHIFT_SIZES: readonly Size[] = [
  { name: "360x640", width: 360, height: 640, kind: "fit" },
  { name: "390x844", width: 390, height: 844, kind: "fit" },
  { name: "1280x800", width: 1280, height: 800, kind: "fit" },
];

// The limit is a starting value (assumption, DS-52) in quality-limits.json, the one file of the code limits.
const LIMITS = JSON.parse(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file next to the code limits, not from input
  readFileSync(new URL("../../../../../config/gates/quality-limits.json", import.meta.url), "utf8"),
) as { layoutShift: { maxCls: number } };
export const SHIFT_MAX_CLS = LIMITS.layoutShift.maxCls;

/** A listed load may get this much worse (in CLS) before it fails (FR-QG-17). */
export const WORSE_SHIFT = 0.02;
/** A listed load must leave the baseline once it is clearly under the limit by this much: a smaller gap is noise (as STALE_MARGIN). */
export const STALE_SHIFT = 0.03;

/** One layout shift of the page: its time (ms), value, whether input caused it, and the elements it moved. */
export interface Shift {
  t: number;
  value: number;
  recent: boolean;
  sources: string[];
}

/** The judged cold load of one screen at one size. `raw` is the plain sum of the shifts, a diagnostic only. */
export interface ShiftResult {
  screen: string;
  size: string;
  cls: number;
  raw: number;
  skeleton: boolean;
  worst: string;
}

export interface ShiftEntry {
  screen: string;
  size: string;
  cls: number;
}

/** layout-shift-baseline.json: the loads that are above the limit, with their measured CLS. It only shrinks (FR-QG-17). */
export interface ShiftBaseline {
  maxEntries: number;
  entries: ShiftEntry[];
}

/** Cumulative layout shift: the largest session window (gaps under 1 s, at most 5 s long) of the shifts without recent input. */
export function clsOf(shifts: readonly Shift[]): number {
  let best = 0;
  let sum = 0;
  let start = -Infinity;
  let last = -Infinity;
  for (const s of shifts.filter((x) => !x.recent).sort((a, b) => a.t - b.t)) {
    if (s.t - last > 1000 || s.t - start > 5000) {
      sum = 0;
      start = s.t;
    }
    sum += s.value;
    last = s.t;
    best = Math.max(best, sum);
  }
  return Math.round(best * 1000) / 1000;
}

/** One cold load in numbers (pure): its CLS, the plain sum, whether a status showed, and the element of the largest shift. */
export function evaluateShift(
  screen: string,
  size: Size,
  shifts: readonly Shift[],
  skeleton: boolean,
): ShiftResult {
  const worst = shifts.filter((s) => !s.recent).sort((a, b) => b.value - a.value)[0];
  const raw = shifts.reduce((n, s) => n + (s.recent ? 0 : s.value), 0);
  return {
    screen,
    size: size.name,
    cls: clsOf(shifts),
    raw: Math.round(raw * 1000) / 1000,
    skeleton,
    worst: (worst?.sources ?? []).join(" / "),
  };
}

/** The violations of one cold load (pure, FR-QG-17): above the limit it fails with its worst element; a listed one may get
 * worse by WORSE_SHIFT at most; a listed one clearly under the limit must leave the baseline (unless the screen is unstable). */
export function judgeShift(r: ShiftResult, baseline: ShiftBaseline, unstable = false): string[] {
  const label = `${r.screen} at ${r.size}`;
  const entry = baseline.entries.find((e) => e.screen === r.screen && e.size === r.size);
  if (r.cls <= SHIFT_MAX_CLS)
    return entry && !unstable && entry.cls > SHIFT_MAX_CLS + STALE_SHIFT
      ? [`${label}: fits now (cls ${r.cls}), remove it from the baseline`]
      : [];
  const over = `${label}: layout shift ${r.cls.toFixed(3)} > ${SHIFT_MAX_CLS}: ${r.worst}`;
  if (!entry) return [over];
  return r.cls > entry.cls + WORSE_SHIFT
    ? [`${over} (worse than the baseline, listed at ${entry.cls})`]
    : [];
}

/** The baseline itself only shrinks: more entries than maxEntries, or entries of screens or sizes that do not exist. */
export function judgeShiftBaseline(
  baseline: ShiftBaseline,
  screens: ReadonlySet<string>,
  sizes: ReadonlySet<string>,
): string[] {
  const shrink =
    baseline.entries.length > baseline.maxEntries
      ? [
          `layout-shift baseline has ${baseline.entries.length} entries, maxEntries is ${baseline.maxEntries}: it only shrinks (FR-QG-17)`,
        ]
      : [];
  const names = baseline.entries.flatMap((e) => [
    ...(screens.has(e.screen)
      ? []
      : [`layout-shift baseline names the unknown screen ${e.screen}`]),
    ...(sizes.has(e.size) ? [] : [`layout-shift baseline names the unknown size ${e.size}`]),
  ]);
  return [...shrink, ...names];
}
/** Loads above this CLS are listed in the baseline (below the limit): a listed load may not get worse by WORSE_SHIFT, so the
 * loads near the limit are guarded too (owner decision 2026-11-08). */
export const LISTED_FROM = 0.08;

/** The highest CLS of every screen and size over several runs (owner decision 2026-11-08): a load that runs differ on keeps its
 * highest value, so the baseline is never tighter than what the runs measured (P-08). */
export function highestOf(runs: readonly (readonly ShiftResult[])[]): ShiftResult[] {
  const best = new Map<string, ShiftResult>();
  for (const run of runs)
    for (const r of run) {
      const key = `${r.screen}|${r.size}`;
      const kept = best.get(key);
      if (!kept || r.cls > kept.cls) best.set(key, r);
    }
  return [...best.values()];
}

/** The baseline a complete run writes: every load above LISTED_FROM, with its measured CLS (never an invented value, P-08). */
export function buildShiftBaseline(results: readonly ShiftResult[]): ShiftBaseline {
  const entries = results
    .filter((r) => r.cls > LISTED_FROM)
    .map((r) => ({ screen: r.screen, size: r.size, cls: r.cls }));
  return { maxEntries: entries.length, entries };
}
