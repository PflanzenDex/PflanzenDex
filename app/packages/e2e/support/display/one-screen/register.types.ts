// The types of the screen register of the one-screen gate (issue 2431): what an entry of screens.json holds. Types only; the
// register is in register.ts and the checks of its kinds, states and families in register.check.ts.

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

/** What a view is (issue 2431): its rules are the required states of REQUIRED_STATES in register.check.ts. */
export type Kind = "overview" | "list" | "table" | "sheet" | "card-row" | "deck";

/** The state a register entry measures (issue 2431). `many` is the state of every view that has no state of its own. */
export type State = "empty" | "one" | "many" | "due-hints" | "error" | "card" | "fitting" | "half";

/**
 * The precondition of a state (issue 2431): checked after the steps, before the measure. `text` or `css` must be on the page
 * (`count`: at least that many matches); `absent: true` means it must not be (an empty state). A miss is a seed gap: the test
 * fails with "seed gap: <screen>: …", names no rule and is never baselined (#2350, #2427).
 */
export interface Expect {
  text?: string;
  css?: string;
  count?: number;
  absent?: boolean;
}

/**
 * The answer of the gate to one write that a step triggers (issue 2622). The gate aborts every write, so a state that only the
 * refusal of a write shows (the notice "Schon angefragt" after "Ablehnen" on an offer that the keeper asked for already) is out of
 * reach of its click. The request of `method` to `path` (the segments of the API path; `*` stands for one segment) gets this
 * status and body from the gate and never reaches the API, so nothing is written.
 */
export interface Reply {
  method: "PUT" | "POST" | "DELETE";
  path: string;
  status: number;
  body: unknown;
}

// One screen: a view, layer, dialog or sign-in page. `route`: the route pattern when a click leads elsewhere; `layerFile`:
// the source file of its LayerSheet; `capExempt`: why the 1920 px cap does not apply; `sidewaysExempt`: why a region of it
// deliberately scrolls sideways (the page itself never may); `unstable`: why its content changes between runs (it is never
// reported as fitting now, only as new or worse). `test4` is the gate account with more than 100 plants (issue 1378), `test5`
// and `test6` are the hint accounts with one plant, style few and a calm hint due (issue 2384): `test5` shows
// `first_plant_saved` on the plant layer, `test6` `first_measurement` in "Verlauf"; both show `function_unlocked` on Heute.
// `test7` is the empty account (issue 2500): no plant, wish or friend, so the empty states of the Sammlung (plants and species)
// are on it.
// Issue 2431: `kind` is what the view is and `state` the state this entry measures; `family` groups the states of one view;
// `fail` is a path whose GET is refused (the error state); `reply` answers one write of a step (see Reply); `expect` is the
// precondition; `sizes` names the sizes of a new state (three; no field means every size of SIZES).
export interface Screen {
  id: string;
  account: "test" | "test2" | "test3" | "test4" | "test5" | "test6" | "test7" | "anon";
  path: string;
  steps?: Step[];
  route?: string;
  layerFile?: string;
  title?: string;
  capExempt?: string;
  sidewaysExempt?: string;
  unstable?: string;
  kind: Kind;
  state: State;
  family?: string;
  fail?: string;
  reply?: Reply;
  expect?: Expect;
  sizes?: string[];
}
