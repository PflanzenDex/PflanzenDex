import { readFileSync } from "node:fs";

// The screen register of the one-screen gate (issue 1137, QG-U8): every view, layer, dialog and sign-in page, read from
// screens.json so the unit tests of the web package check the same list.

/**
 * One click: by CSS selector or by role and name (exact, or `re` as a case-insensitive pattern). `nth` picks the match
 * (from 0). `select` chooses the option with that value of a select instead of clicking it; `key` presses that key on the
 * page instead, e.g. Escape closes a layer that has no close button on a phone (issue 1378).
 */
export interface Step {
  css?: string;
  role?: string;
  name?: string;
  re?: string;
  nth?: number;
  select?: string;
  key?: string;
}

// One screen: a view, layer, dialog or sign-in page. `route`: the route pattern when a click leads elsewhere; `layerFile`:
// the source file of its LayerSheet; `capExempt`: why the 1920 px cap does not apply; `sidewaysExempt`: why a region of it deliberately scrolls
// sideways (the page itself never may); `unstable`: why its content
// changes between runs (it is never reported as fitting now, only as new or worse). `test4` is the gate account with more
// than 100 plants (issue 1378, seeded by the states profile).
export interface Screen {
  id: string;
  account: "test" | "test2" | "test3" | "test4" | "anon";
  path: string;
  steps?: Step[];
  route?: string;
  layerFile?: string;
  title?: string;
  capExempt?: string;
  sidewaysExempt?: string;
  unstable?: string;
}

/** The register: read from the checked-in file, so the unit tests of the web package read the same list (issue 1137). */
export const SCREENS: readonly Screen[] = JSON.parse(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file next to this module
  readFileSync(new URL("../screens.json", import.meta.url), "utf8"),
) as Screen[];

// US-QG-01 (owner decision 2026-11-07): one CI job per shard runs both UI gates for its screens, so a screen costs its time
// in both gates. The weights are medians of several CI runs (seconds per test, each job's runner speed factored out), refreshed
// with `make ui-weights` (issue 1667; register.weights.json, a companion of this file: one unit of the layout rule). A screen
// without a weight counts as the median of its gate, so a new screen never breaks the split.
export type UiGate = "one-screen" | "a11y-routes";

interface WeightsFile {
  source: string;
  gates: Record<UiGate, Record<string, number>>;
}

const WEIGHTS = JSON.parse(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file next to this module
  readFileSync(new URL("./register.weights.json", import.meta.url), "utf8"),
) as WeightsFile;

const TABLES: Record<UiGate, Map<string, number>> = {
  "one-screen": new Map(Object.entries(WEIGHTS.gates["one-screen"])),
  "a11y-routes": new Map(Object.entries(WEIGHTS.gates["a11y-routes"])),
};

function median(values: readonly number[]): number {
  if (values.length === 0)
    throw new Error("one-screen: the weights file names no screen of a gate");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

const MEDIANS: Record<UiGate, number> = {
  "one-screen": median([...TABLES["one-screen"].values()]),
  "a11y-routes": median([...TABLES["a11y-routes"].values()]),
};

/** The median of the measured weights of one gate: what a screen without a weight takes (seconds). */
export function medianOf(gate: UiGate): number {
  return MEDIANS[gate];
}

/** Seconds that a screen takes in one gate: its measured weight, or the median of the gate for a screen without one. */
export function weightOf(gate: UiGate, id: string): number {
  return TABLES[gate].get(id) ?? MEDIANS[gate];
}

/** What a screen costs in both gates together: the measure of the split, because every shard runs both gates. */
export function costOf(id: string): number {
  return weightOf("one-screen", id) + weightOf("a11y-routes", id);
}

/**
 * The shard (from 1 to `total`) of every screen: greedy, the costliest screen first into the lightest shard, ties by id and
 * then by the lower shard. The split depends on the screens and their costs only, not on the order of `screens`, so every
 * machine gets the same one (US-QG-01).
 */
export function planShards(
  screens: readonly Screen[],
  total: number,
  cost: (id: string) => number = costOf,
): Map<string, number> {
  const order = screens
    .map((screen) => ({ id: screen.id, cost: cost(screen.id) }))
    .sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const loads = Array.from({ length: total }, () => 0);
  const plan = new Map<string, number>();
  for (const { id, cost: weight } of order) {
    if (plan.has(id)) throw new Error(`one-screen: the register names screen "${id}" twice`);
    let lightest = 0;
    for (let shard = 1; shard < total; shard++) {
      if ((loads[shard] ?? 0) < (loads[lightest] ?? 0)) lightest = shard;
    }
    loads[lightest] = (loads[lightest] ?? 0) + weight;
    plan.set(id, lightest + 1);
  }
  return plan;
}

/** `i/n` as SHARD of make ui-gates passes it: shard i of n shards, whole numbers, 1 <= i <= n. */
export function parseShard(text: string): { index: number; total: number } {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text);
  const index = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || index > total)
    throw new Error(`one-screen: SHARD "${text}" must be i/n with 1 <= i <= n`);
  return { index, total };
}

/**
 * The screens of this run: all of them; the one that `only` names (ONE_SCREEN_ONLY, SCREEN of make one-screen, issue 1608);
 * or the screens of one shard `shard` ("i/n", ONE_SCREEN_SHARD and A11Y_ROUTES_SHARD, SHARD of make ui-gates, US-QG-01).
 * A partial run is no shard: both at once are refused.
 */
export function screensOf(only: string, shard = ""): readonly Screen[] {
  if (only !== "" && shard !== "")
    throw new Error(
      "one-screen: SCREEN cannot be combined with SHARD: one screen is a partial run, not a shard of the gate",
    );
  if (shard !== "") {
    const { index, total } = parseShard(shard);
    const plan = planShards(SCREENS, total);
    return SCREENS.filter((screen) => plan.get(screen.id) === index);
  }
  if (only === "") return SCREENS;
  const found = SCREENS.filter((screen) => screen.id === only);
  if (found.length === 0)
    throw new Error(
      `one-screen: unknown screen "${only}", the valid ids are: ${SCREENS.map((s) => s.id).join(", ")}`,
    );
  return found;
}
