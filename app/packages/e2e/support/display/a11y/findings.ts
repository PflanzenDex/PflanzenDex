// The pure part of the accessibility gate per route (FR-QG-24, QG-U7, issue 467): what a finding is, how a run is
// compared with the baseline (FR-QG-17, it only shrinks) and how a baseline is built from the results of a full run.
// No browser here, so the self-test in tests/accessibility/routes/a11y-routes-self-test.spec.ts runs without one.

export interface A11ySize {
  name: string;
  width: number;
  height: number;
}

/** Phone and desktop (decision of issue 467); a screen is opened once and resized. */
export const A11Y_SIZES: readonly A11ySize[] = [
  { name: "390x844", width: 390, height: 844 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

export type Kind = "axe" | "keyboard";

/** The checks of the keyboard walk; the name is the `rule` of a keyboard finding. */
export type KeyboardCheck = "reach" | "focus-visible" | "not-hidden" | "no-trap" | "skip-link";

/** One rule that failed on one screen at one size: `rule` is an axe rule id or a keyboard check; `nodes` names elements. */
export interface Finding {
  kind: Kind;
  rule: string;
  count: number;
  nodes: string[];
}

/** All findings of one screen at one size (an empty list is a clean screen). */
export interface Result {
  screen: string;
  size: string;
  findings: Finding[];
}

export interface BaselineEntry {
  screen: string;
  size: string;
  kind: Kind;
  rule: string;
  count: number;
}

export interface Baseline {
  maxEntries: number;
  entries: BaselineEntry[];
}

const same = (e: BaselineEntry, r: Result, f: { kind: Kind; rule: string }) =>
  e.screen === r.screen && e.size === r.size && e.kind === f.kind && e.rule === f.rule;

const NAMED_NODES = 3;

/** Names the elements of a finding for the failure text (first few only). */
const describeNodes = (f: Finding) => {
  const rest = f.nodes.length - NAMED_NODES;
  return f.nodes.slice(0, NAMED_NODES).join("; ") + (rest > 0 ? `; ... (${rest} more)` : "");
};

/** The violations of one screen and size: findings not in the baseline, listed ones that got worse, stale entries. */
export function judgeResult(result: Result, baseline: Baseline, unstable = false): string[] {
  const label = `${result.screen} at ${result.size}`;
  const out: string[] = [];
  for (const f of result.findings) {
    const entry = baseline.entries.find((e) => same(e, result, f));
    const what = `${f.kind} ${f.rule}, ${f.count} element(s): ${describeNodes(f)}`;
    if (!entry) out.push(`${label}: ${what}`);
    else if (f.count > entry.count)
      out.push(`${label}: worse than the baseline (${f.count} > ${entry.count}): ${what}`);
  }
  if (unstable) return out;
  for (const e of baseline.entries) {
    const found = result.findings.some((f) => same(e, result, f));
    if (e.screen === result.screen && e.size === result.size && !found)
      out.push(`${label}: ${e.kind} ${e.rule} is not found any more, remove it from the baseline`);
  }
  return out;
}

/** The baseline itself only shrinks and names only screens and sizes that exist. */
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

/** The baseline a full run would write: every finding with its count. */
export function buildBaseline(results: readonly Result[]): Baseline {
  const entries = results.flatMap((r) =>
    r.findings.map((f): BaselineEntry => ({
      screen: r.screen,
      size: r.size,
      kind: f.kind,
      rule: f.rule,
      count: f.count,
    })),
  );
  return { maxEntries: entries.length, entries };
}
