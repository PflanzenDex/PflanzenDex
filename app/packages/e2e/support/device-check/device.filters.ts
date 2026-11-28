import {
  DEFAULT_DEVICES,
  DEVICE_IDS,
  TEXT_SIZES,
  THEMES,
  type Cell,
  type DeviceId,
  type TextSize,
  type Theme,
} from "./device";

// The filters of `make device-check` (US-DEV-01, issue 2504): SCREEN, FLOW, DEVICE, THEME, TEXT and FORCED as comma lists. A value
// that names nothing known is refused here, before a browser or a server starts. Pure: no browser, no file system.

/** The raw settings as the environment holds them (DEVICE_CHECK_*); an unset or blank value means "all". */
export type RawFilters = {
  DEVICE_CHECK_SCREEN?: string | undefined;
  DEVICE_CHECK_FLOW?: string | undefined;
  DEVICE_CHECK_DEVICE?: string | undefined;
  DEVICE_CHECK_THEME?: string | undefined;
  DEVICE_CHECK_TEXT?: string | undefined;
  DEVICE_CHECK_FORCED?: string | undefined;
};

/** The known values the filters are checked against: the register ids and the flow names. */
export interface Known {
  screens: readonly string[];
  flows: readonly string[];
}

/** The parsed filters: the ids to run, and the axes of the matrix (every axis holds at least one value). */
export interface Filters {
  screens: string[];
  flows: string[];
  devices: DeviceId[];
  themes: Theme[];
  texts: TextSize[];
  forced: boolean;
}

/** `a,b,a` becomes ["a", "b"]: trimmed, blanks dropped, duplicates removed in their first order. */
export function listOf(raw: string | undefined): string[] {
  const items = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return [...new Set(items)];
}

/** The ids of `values` that `allowed` does not hold, in their order. */
export function unknownOf(values: readonly string[], allowed: readonly string[]): string[] {
  return values.filter((v) => !allowed.includes(v));
}

/** Up to three ids that look like the unknown one (a shared prefix or a small edit distance): hints for a typo. */
export function similarOf(value: string, allowed: readonly string[]): string[] {
  const scored = allowed.map((id) => ({ id, d: editDistance(value, id) }));
  return scored
    .filter((s) => s.d <= Math.max(2, Math.floor(value.length / 3)) || s.id.startsWith(value))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
    .slice(0, 3)
    .map((s) => s.id);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j] ?? 0;
      row[j] = Math.min(up + 1, (row[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length] ?? 0;
}

/** Names the unknown values of one kind, with the closest known ones; `kind` is what the value is ("screen", "flow" …). */
function refuse(
  kind: string,
  unknown: readonly string[],
  allowed: readonly string[],
  hint: string,
): void {
  if (unknown.length === 0) return;
  const parts = unknown.map((value) => {
    const similar = similarOf(value, allowed);
    return `"${value}"${similar.length ? ` (did you mean ${similar.map((s) => `"${s}"`).join(", ")}?)` : ""}`;
  });
  throw new Error(`device-check: unknown ${kind} ${parts.join(", ")}; ${hint}`);
}

/** The values of one axis: the given ones (validated), or the default when the setting is blank. */
function axisOf<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  const given = listOf(raw);
  if (given.length === 0) return [...fallback];
  refuse(name, unknownOf(given, allowed), allowed, `the valid values are: ${allowed.join(", ")}`);
  return allowed.filter((v) => given.includes(v));
}

/**
 * Parses and checks the filters (US-DEV-01): SCREEN and FLOW select what runs (at least one of them is needed: a run over the
 * whole register is refused), DEVICE, THEME and TEXT select the matrix (default: the emulated devices, both themes, 100 % text;
 * TEXT=200 stays selectable, d-190). Throws an Error that names every unknown value and the valid ones; nothing starts before this has passed.
 */
export function parseFilters(raw: RawFilters, known: Known): Filters {
  const screens = listOf(raw.DEVICE_CHECK_SCREEN);
  const flows = listOf(raw.DEVICE_CHECK_FLOW);
  if (screens.length === 0 && flows.length === 0)
    throw new Error(
      "device-check: give SCREEN=<id>[,<id>…] or FLOW=<name>[,<name>…]; a run over the whole register (156 screens, 12 cells each) is not a run of this tool",
    );
  refuse(
    "screen",
    unknownOf(screens, known.screens),
    known.screens,
    "the screen ids are in app/packages/e2e/support/display/screens.json",
  );
  refuse(
    "flow",
    unknownOf(flows, known.flows),
    known.flows,
    `the flows are: ${known.flows.join(", ") || "none yet"}`,
  );
  const forcedRaw = (raw.DEVICE_CHECK_FORCED ?? "").trim();
  if (forcedRaw !== "" && forcedRaw !== "1" && forcedRaw !== "0")
    throw new Error(
      `device-check: FORCED "${forcedRaw}" must be 1 (forced colors) or 0 (the default)`,
    );
  return {
    screens,
    flows,
    devices: axisOf<DeviceId>("device", raw.DEVICE_CHECK_DEVICE, DEVICE_IDS, DEFAULT_DEVICES),
    themes: axisOf<Theme>("theme", raw.DEVICE_CHECK_THEME, THEMES, THEMES),
    texts: axisOf<TextSize>("text size", raw.DEVICE_CHECK_TEXT, TEXT_SIZES, ["100"]),
    forced: forcedRaw === "1",
  };
}

/** The cells of a run: every screen of SCREEN, then every flow of FLOW (on the screen the flow opens), each over the matrix. */
export function cellsOf(filters: Filters, screenOf: (flow: string) => string): Cell[] {
  const cells: Cell[] = [];
  const axes = { forced: filters.forced };
  const add = (kind: Cell["kind"], id: string, screen: string) => {
    for (const device of filters.devices)
      for (const theme of filters.themes)
        for (const text of filters.texts)
          cells.push({ kind, id, screen, device, theme, text, ...axes });
  };
  for (const screen of filters.screens) add("screen", screen, screen);
  for (const flow of filters.flows) add("flow", flow, screenOf(flow));
  return cells;
}

/** The number of cells the filters make, without building them (the usage text and the run time estimate). */
export function cellCount(filters: Filters): number {
  return (
    (filters.screens.length + filters.flows.length) *
    filters.devices.length *
    filters.themes.length *
    filters.texts.length
  );
}
