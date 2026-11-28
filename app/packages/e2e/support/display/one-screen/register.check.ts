import { SIZES, type Size } from "./judge";
import { activeSizeSet, sizesIn, type SizeSet } from "../selection/size-set";
import type { Kind, Screen, State } from "./register.types";

// The checks of the screen register (US-QS-15, QG-U8; issue 2431): which states a family of a kind needs, what is wrong with the
// kinds, states, sizes and families of the entries, and the sizes an entry is measured at. Pure, no browser. Registered through
// the spec self-test (one-screen.register.ts), which runs on the checked-in register.

/** The states that a family of an enforced kind must have (owner decision 2026-11-23). Other kinds have no rule. */
export const REQUIRED_STATES: Partial<Record<Kind, readonly State[]>> = {
  list: ["empty", "one", "many", "error"],
  deck: ["card", "empty"],
  sheet: ["fitting", "half"],
};

const KINDS: readonly Kind[] = ["overview", "list", "table", "sheet", "card-row", "deck"];
const STATES: readonly State[] = [
  "empty",
  "one",
  "many",
  "due-hints",
  "error",
  "card",
  "fitting",
  "half",
];

/** A reply answers the write of a step (issue 2622): it needs a step, an API path and a status of an answer. */
function replyProblems(s: Screen): string[] {
  const reply = s.reply;
  if (!reply) return [];
  const problems: string[] = [];
  if (!s.steps?.length)
    problems.push(`${s.id}: reply answers the write of a step, but there is no step`);
  if (!reply.path.startsWith("/"))
    problems.push(`${s.id}: reply path "${reply.path}" is no API path`);
  if (!Number.isInteger(reply.status) || reply.status < 200 || reply.status > 599)
    problems.push(`${s.id}: reply status ${String(reply.status)} is no HTTP status`);
  return problems;
}

/** The kind of an entry and its family's states: a message for each kind, state or size name that is unknown, and each missing state. */
function entryProblems(s: Screen, sizeNames: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (!KINDS.includes(s.kind))
    problems.push(`${s.id}: kind "${String(s.kind)}" is not one of ${KINDS.join(", ")}`);
  if (!STATES.includes(s.state))
    problems.push(`${s.id}: state "${String(s.state)}" is not one of ${STATES.join(", ")}`);
  for (const name of s.sizes ?? [])
    if (!sizeNames.has(name)) problems.push(`${s.id}: size "${name}" is not in SIZES`);
  if (s.expect && !s.expect.text && !s.expect.css)
    problems.push(`${s.id}: expect names neither a text nor a css selector`);
  problems.push(...replyProblems(s));
  return problems;
}

/** The problems of one family: its entries must share one kind, and an enforced kind needs each required state. */
function familyProblems(family: string, members: readonly Screen[]): string[] {
  const kinds = [...new Set(members.map((m) => m.kind))];
  if (kinds.length > 1)
    return [`family ${family}: its entries have different kinds (${kinds.join(", ")})`];
  const kind = kinds[0];
  const required = kind ? REQUIRED_STATES[kind] : undefined;
  if (!required) return [];
  const have = new Set(members.map((m) => m.state));
  return required
    .filter((state) => !have.has(state))
    .map(
      (state) =>
        `family ${family} (${kind}) has no "${state}" state: add its register entry (US-QS-15)`,
    );
}

/**
 * What is wrong with the register's kinds, states, sizes and families (issue 2431), as messages. An entry without a family is
 * not enforced; a kind without a rule has no required state.
 */
export function registerProblems(screens: readonly Screen[]): string[] {
  const sizeNames = new Set(SIZES.map((s) => s.name));
  const families = new Map<string, Screen[]>();
  for (const s of screens)
    if (s.family !== undefined) families.set(s.family, [...(families.get(s.family) ?? []), s]);
  return [
    ...screens.flatMap((s) => entryProblems(s, sizeNames)),
    ...[...families].flatMap(([family, members]) => familyProblems(family, members)),
  ];
}

/**
 * The sizes an entry is measured at: its own `sizes` by name, or every size of SIZES, then the size set of the run
 * (ONE_SCREEN_SIZES, US-QG-02 issue 2666; `all` unless the environment names another). An entry with no size left is not measured.
 */
export function sizesOf(screen: Screen, set: SizeSet = activeSizeSet()): readonly Size[] {
  const own =
    screen.sizes === undefined ? SIZES : SIZES.filter((s) => screen.sizes?.includes(s.name));
  return sizesIn(set, own);
}

/** How many measurements a full run makes: every screen at each of its sizes (the reporter's check of a complete run). */
export function measurementsOf(screens: readonly Screen[], set: SizeSet = activeSizeSet()): number {
  return screens.reduce((n, s) => n + sizesOf(s, set).length, 0);
}
