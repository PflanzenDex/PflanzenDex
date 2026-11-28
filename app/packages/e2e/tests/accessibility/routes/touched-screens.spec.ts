import { expect, test } from "@playwright/test";
import type { Screen } from "../../../support/display/one-screen/register.types";
import {
  classify,
  closureOf,
  homeOf,
  importersOf,
  specifiersOf,
  touchedScreens,
  unitOf,
  type Importers,
} from "../../../support/display/selection/touched-screens";
import { touchedRegisterSelfTests } from "./touched-screens.register";

// US-QG-02 (owner decision d-190, issue 2666): the touched-screens mapper decides which screens a pull request runs. These are pure
// self-tests: the importers are given (no disk) except where a test names the checked-in register or the CLI. The project
// "one-screen" runs this file (playwright.config.ts); the register, output and CLI tests are in touched-screens.register.ts.

const WEB = "app/packages/web/src/";
const screen = (over: Partial<Screen> & Pick<Screen, "id">): Screen => ({
  account: "test2",
  path: "/today",
  kind: "overview",
  state: "many",
  ...over,
});
/** Importers with no edges: a change touches only the units that it names. */
const NO_EDGES: Importers = new Map();
/** Imported unit -> importers, written as a list of pairs for the tests. */
const edges = (...pairs: [imported: string, importer: string][]): Importers => {
  const map = new Map<string, Set<string>>();
  for (const [to, from] of pairs) map.set(to, new Set([...(map.get(to) ?? []), from]));
  return map;
};
const WISH = screen({
  id: "wish",
  path: "/collection?view=wishlist",
  layerFile: "wishlist/wishlist-page/layers/wishlist-layers/wishlist-layers.tsx",
});
const TODAY = screen({ id: "today", path: "/today" });
const ONE = [WISH, TODAY];

test("US-QG-02 a change in one unit selects the screens shown from it: a screens.json entry of a wishlist layer, a change in web/src/wishlist/", () => {
  expect(touchedScreens([`${WEB}wishlist/wishlist-page/x.tsx`], ONE, NO_EDGES)).toEqual({
    all: false,
    ids: ["wish"],
  });
});

test("US-QG-02 a change in shared UI, the tokens, the frame, the e2e support, the demo seed and a gate file selects all screens", () => {
  for (const file of [
    `${WEB}shared/ui/button.tsx`,
    `${WEB}styles/tokens.css`,
    `${WEB}app/routes.tsx`,
    `${WEB}app/frame/app/app.tsx`,
    "app/packages/e2e/support/display/one-screen/fit.ts",
    "app/packages/api/perf/demo-seed/seed.ts",
    "app/config/gates/quality-limits.json",
    "Makefile",
    ".github/workflows/ci.yml",
  ])
    expect(touchedScreens([file], ONE, NO_EDGES), file).toEqual({
      all: true,
      ids: ["wish", "today"],
    });
});

test("US-QG-02 a test, a story or a Markdown file selects no screen, and a path that is no UI selects none either", () => {
  for (const file of [
    `${WEB}wishlist/wishlist-page/x.test.tsx`,
    `${WEB}wishlist/wishlist-page/x.stories.tsx`,
    `${WEB}wishlist/README.md`,
    `${WEB}wishlist/__snapshots__/x.snap`,
    "app/packages/e2e/tests/mobile/flow.spec.ts",
    "app/packages/core/src/plant.ts",
    "app/packages/api/src/routes.ts",
    "app/tools/workflow/x.mjs",
    "docs/guides/operations/x.md",
  ])
    expect(touchedScreens([file], ONE, NO_EDGES), file).toEqual({ all: false, ids: [] });
});

test("US-QG-02 an unmapped web file selects all: a file loose in web/src, in the frame, or in an app folder that is no destination, flow or legacy route", () => {
  for (const file of [
    `${WEB}main.tsx`,
    `${WEB}app/destinations/loose.ts`,
    `${WEB}app/destinations/area-parts`,
    `${WEB}flows.de.json`,
    "app/packages/web/index.html",
  ])
    expect(touchedScreens([file], ONE, NO_EDGES), file).toEqual({
      all: true,
      ids: ["wish", "today"],
    });
});

test("US-QG-02 a spec of the register's runners is a screen change (it selects all), another spec selects none", () => {
  expect(
    touchedScreens(
      ["app/packages/e2e/tests/accessibility/routes/merge-shards.spec.ts"],
      ONE,
      NO_EDGES,
    ).all,
  ).toBe(true);
  expect(touchedScreens(["app/packages/e2e/tests/mobile/x.spec.ts"], ONE, NO_EDGES).ids).toEqual(
    [],
  );
});

test("US-QG-02 a change in a unit touches the units that import it, and not past a hub", () => {
  // collection-area imports wishlist; app (the hub) imports collection-area and must not pull in its own importers.
  const graph = edges(
    ["wishlist", "collection-area"],
    ["collection-area", "app"],
    ["app", "entry"],
  );
  const touched = closureOf(new Set(["wishlist"]), graph);
  expect([...touched].sort()).toEqual(["app", "collection-area", "wishlist"]);
  expect(touchedScreens([`${WEB}wishlist/x.tsx`], ONE, graph).ids).toEqual(["wish"]);
});

test("US-QG-02 a changed hub touches the units that import it (a change to the destinations' shared parts reaches them)", () => {
  const graph = edges(
    ["app/destinations/area-parts", "app/destinations/today-area"],
    ["app/destinations/today-area", "app"],
  );
  const touched = closureOf(new Set(["app/destinations/area-parts"]), graph);
  expect(touched.has("app/destinations/today-area")).toBe(true);
  expect(touched.has("app")).toBe(true);
  const todayShown = screen({ id: "today-shown", path: "/today" });
  expect(
    touchedScreens([`${WEB}app/destinations/area-parts/lazy-areas.ts`], [todayShown], graph).ids,
  ).toEqual(["today-shown"]);
});

test("US-QG-02 a screen whose path names no home is touched by every web change (fail safe)", () => {
  const unknown = screen({ id: "unknown", path: "/no-such-page" });
  expect(homeOf(unknown)).toBeNull();
  expect(touchedScreens([`${WEB}wishlist/x.tsx`], [unknown], NO_EDGES).ids).toEqual(["unknown"]);
});

test("US-QG-02 the homes: the layer file's unit joins the units of the path, and the welcome page lives in the account", () => {
  expect(homeOf(WISH)).toEqual(
    expect.arrayContaining(["wishlist", "app/destinations/collection-area", "collection"]),
  );
  expect(homeOf(screen({ id: "welcome", path: "/" }))).toContain("account");
  expect(homeOf(screen({ id: "op", path: "/operator" }))).toContain("account");
});

test("US-QG-02 the unit of a web file: a folder of its own, an app area of its own, the rest of app is the hub", () => {
  expect(unitOf("wishlist/x.tsx")).toBe("wishlist");
  expect(unitOf("app/destinations/today-area/x.tsx")).toBe("app/destinations/today-area");
  expect(unitOf("app/flows/unlock/x.tsx")).toBe("app/flows");
  expect(unitOf("app/legacy-routes/x.tsx")).toBe("app/legacy-routes");
  expect(unitOf("app/routes.tsx")).toBe("app");
  expect(classify(`${WEB}app/flows/unlock/x.tsx`)).toEqual({ kind: "unit", unit: "app/flows" });
});

test("US-QG-02 the import graph reads the static, dynamic and re-exported specifiers of the web sources, and not the bare packages", () => {
  const text = [
    'import { a } from "./a";',
    'import type { B } from "../shared/b";',
    'const c = await import("@/collection/c");',
    'export { d } from "../wishlist/d";',
    'import react from "react";',
  ].join("\n");
  expect(specifiersOf(text)).toEqual(["./a", "../shared/b", "@/collection/c", "../wishlist/d"]);
  const graph = importersOf([{ path: "catalog/index.ts", text: 'export * from "../wishlist/d";' }]);
  expect([...(graph.get("wishlist") ?? [])]).toEqual(["catalog"]);
});

touchedRegisterSelfTests();
