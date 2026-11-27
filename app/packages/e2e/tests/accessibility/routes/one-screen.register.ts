import { expect, type Page } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { checkExpect } from "../../../support/display/one-screen/fit.expect";
import { SCREENS, type Screen } from "../../../support/display/one-screen/register";
import {
  REQUIRED_STATES,
  measurementsOf,
  registerProblems,
  sizesOf,
} from "../../../support/display/one-screen/register.check";

// Self-test of the register's kinds, states and families of the one-screen gate (US-QS-15, QG-U8; issue 2431): pure, no browser.
// A family of an enforced kind has its required states (list: empty, one, many, error; deck: card, empty; sheet: fitting, half); the
// new states run at three sizes; a missing precondition is a seed gap, named as such. Registered from one-screen.spec.ts.

const entry = (over: Partial<Screen> & Pick<Screen, "id">): Screen => ({
  account: "test2",
  path: "/",
  kind: "overview",
  state: "many",
  ...over,
});

/** A page that shows `shown` matches of any text or selector (the precondition reads only the count). */
const pageShowing = (shown: number) =>
  ({
    getByText: () => ({ evaluateAll: async () => shown }),
    locator: () => ({ evaluateAll: async () => shown }),
  }) as unknown as Page;

function familyTests(): void {
  test("US-QS-15 the owner decision of 2026-11-23 names the required states: list, deck and sheet; no other kind is enforced", () => {
    expect(REQUIRED_STATES).toEqual({
      list: ["empty", "one", "many", "error"],
      deck: ["card", "empty"],
      sheet: ["fitting", "half"],
    });
  });

  test("US-QS-15 every entry of the register has a known kind and state, and its sizes are known", () => {
    expect(registerProblems(SCREENS).filter((p) => !p.startsWith("family "))).toEqual([]);
  });

  // Issue 2431: a family of an enforced kind needs its required states. The plants and species of the Sammlung are complete since
  // issue 2500: the empty account test7 gives their empty state. The register names these families, the match deck and "today".
  test("US-QS-15 the checked-in register has no family that is not complete: the Sammlung lists (issue 2500) and the deck are whole", () => {
    const families = SCREENS.flatMap((s) => (s.family === undefined ? [] : [s.family]));
    expect([...new Set(families)].sort()).toEqual([
      "collection-plants",
      "collection-species",
      "friends-match",
      "today",
    ]);
    expect(registerProblems(SCREENS)).toEqual([]);
  });

  test("US-QS-15 a list family without its error state fails by name", () => {
    const family = [
      entry({ id: "a", kind: "list", state: "empty", family: "f" }),
      entry({ id: "b", kind: "list", state: "one", family: "f" }),
      entry({ id: "c", kind: "list", state: "many", family: "f" }),
    ];
    expect(registerProblems(family)).toEqual([
      'family f (list) has no "error" state: add its register entry (US-QS-15)',
    ]);
  });

  test("US-QS-15 a deck family needs its card and its empty state; a sheet family needs fitting and half", () => {
    const deck = [entry({ id: "d", kind: "deck", state: "empty", family: "d" })];
    expect(registerProblems(deck)[0]).toContain('no "card" state');
    const sheet = [entry({ id: "s", kind: "sheet", state: "fitting", family: "s" })];
    expect(registerProblems(sheet)[0]).toContain('no "half" state');
  });

  test("US-QS-15 a kind without a rule and an entry without a family are not enforced", () => {
    const free = [
      entry({ id: "o1", kind: "overview", state: "due-hints", family: "o" }),
      entry({ id: "o2", kind: "overview", state: "many", family: "o" }),
      entry({ id: "t", kind: "table", state: "many" }),
      entry({ id: "l", kind: "list", state: "many" }),
    ];
    expect(registerProblems(free)).toEqual([]);
  });
}

function problemTests(): void {
  test("US-QS-15 an unknown kind, state or size name, and a family with two kinds, are named", () => {
    const wrong = [
      entry({ id: "k", kind: "grid" as Screen["kind"] }),
      entry({ id: "st", state: "loading" as Screen["state"] }),
      entry({ id: "sz", sizes: ["1000x1000"] }),
      entry({ id: "m1", kind: "list", state: "many", family: "m" }),
      entry({ id: "m2", kind: "deck", state: "card", family: "m" }),
      entry({ id: "ex", expect: { absent: true } as NonNullable<Screen["expect"]> }),
    ];
    const problems = registerProblems(wrong);
    expect(problems.some((p) => p.includes('kind "grid"'))).toBe(true);
    expect(problems.some((p) => p.includes('state "loading"'))).toBe(true);
    expect(problems.some((p) => p.includes('size "1000x1000"'))).toBe(true);
    expect(problems.some((p) => p.includes("different kinds"))).toBe(true);
    expect(problems.some((p) => p.includes("neither a text nor a css"))).toBe(true);
  });

  test("US-QS-15 the new states run at three sizes (360x640, 390x844, 360x640 at 200 %); the old screens keep every size", () => {
    const named = (id: string) =>
      sizesOf(SCREENS.find((s) => s.id === id) as Screen).map((s) => s.name);
    expect(named("wishlist-empty")).toEqual(["360x640", "390x844", "360x640@200%"]);
    expect(named("friends-error")).toEqual(["360x640", "390x844", "360x640@200%"]);
    expect(named("collection-plants-empty")).toEqual(["360x640", "390x844", "360x640@200%"]);
    expect(named("collection-species-one")).toEqual(["360x640", "390x844", "360x640@200%"]);
    expect(named("friends-match")).toHaveLength(7);
    expect(measurementsOf(SCREENS)).toBe(
      SCREENS.reduce((n, s) => n + (s.sizes ? s.sizes.length : 7), 0),
    );
  });
}

function expectTests(): void {
  test("US-QS-15 a precondition that is missing is a seed gap, named with the screen and the text", async () => {
    const screen = entry({ id: "wishlist-one", expect: { text: "1 offener Wunsch" } });
    await expect(checkExpect(pageShowing(0), screen)).rejects.toThrow(
      'seed gap: wishlist-one: the text "1 offener Wunsch" is missing (0 of 1 shown; the state is not in the seed)',
    );
    await expect(checkExpect(pageShowing(1), screen)).resolves.toBeUndefined();
  });

  test("US-QS-15 a count precondition needs that many matches; an empty state needs its card absent", async () => {
    const friends = entry({ id: "friends-many", expect: { css: "ul li", count: 2 } });
    await expect(checkExpect(pageShowing(1), friends)).rejects.toThrow("1 of 2 shown");
    const empty = entry({ id: "friends-match", expect: { css: "article", absent: true } });
    await expect(checkExpect(pageShowing(0), empty)).resolves.toBeUndefined();
    await expect(checkExpect(pageShowing(1), empty)).rejects.toThrow(
      "is shown, but the state needs it absent",
    );
  });
}

export function registerSelfTests(): void {
  test.describe("QG-U8 US-QS-15 self-test: the register's kinds, states and families", () => {
    familyTests();
    problemTests();
  });
  test.describe("QG-U8 US-QS-15 self-test: the preconditions of a state", () => {
    expectTests();
  });
}
