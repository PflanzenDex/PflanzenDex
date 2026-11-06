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
