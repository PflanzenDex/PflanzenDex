// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCOUNT_SECTIONS } from "@/app/destinations/account-area/account-model/account-model";
import {
  ADD_PLANT_PATH,
  EXCHANGE_PATH,
  IMPORT_PATH,
  LABELS_PATH,
  MATCH_PATH,
  PATHS,
  PROFILE_BASE,
} from "@/shared/patterns/navigation/navigation/navigation";

// US-QS-15 (issue 1137): the one-screen gate (QG-U8) measures every route; a route missing from its register fails here.
describe("US-QS-15 every route is in the register of the one-screen gate", () => {
  // The `src` folder, found from this file (app/tests).
  const SRC = fileURLToPath(new URL("../../", import.meta.url));
  const read = (file: string) => readFileSync(`${SRC}${file}`, "utf8");
  const REGISTER = JSON.parse(
    readFileSync(`${SRC}../../e2e/support/display/screens.json`, "utf8"),
  ) as { id: string; path: string; route?: string }[];
  const norm = (route: string) => route.replace(/:[A-Za-z]+/g, ":id").replace(/\/$/, "") || "/";

  // The route patterns of the app, built from the constants the route files use.
  const ROUTES = [
    "/",
    "/unlock/:id",
    "/label/:id",
    ...Object.values(PATHS),
    ADD_PLANT_PATH,
    LABELS_PATH,
    IMPORT_PATH,
    EXCHANGE_PATH,
    MATCH_PATH,
    `${PATHS.friends}/:friendId`,
    `${PROFILE_BASE}/:profileId`,
    ...Object.values(ACCOUNT_SECTIONS).map((section) => `${PATHS.account}/${section}`),
  ].map(norm);

  // Every `path=` expression of the route files. A new route adds one: add it to ROUTES above and give the register
  // (app/packages/e2e/support/display/screens.json) an entry for it.
  const FILES = [
    "app/routes.tsx",
    "app/destinations/area-parts/simple-routes/simple-routes.tsx",
    "app/destinations/collection-area/hand-over-routes/hand-over-routes.tsx",
  ];
  const KNOWN_EXPRESSIONS = [
    '"*"',
    '"/"',
    '"/unlock/:id"',
    '"/label/:id"',
    '":friendId"',
    "ADD_PLANT_PATH",
    "LABELS_PATH",
    "IMPORT_PATH",
    "EXCHANGE_PATH",
    "MATCH_PATH",
    "PATHS.discover",
    "PATHS.friends",
    "PATHS.collection",
    "PATHS.today",
    "PATHS[v]",
    "`${PATHS.account}/*`",
    "`${PROFILE_BASE}/:profileId`",
  ];

  /** The expression after each `path=`: a quoted string, or the text between the braces (template strings may hold braces). */
  const expressionsIn = (source: string): string[] =>
    source
      .split("path=")
      .slice(1)
      .map((rest) => {
        if (rest.startsWith('"')) return rest.slice(0, rest.indexOf('"', 1) + 1);
        let depth = 0;
        for (let i = 0; i < rest.length; i++) {
          depth += rest[i] === "{" ? 1 : rest[i] === "}" ? -1 : 0;
          if (depth === 0) return rest.slice(1, i);
        }
        return rest;
      });

  /** The route a register entry stands for: its `route`, or the path without the query. */
  const routeOf = (entry: { path: string; route?: string }): string =>
    norm(entry.route ?? entry.path.split("?")[0] ?? "");

  it("US-QS-15 the route files declare no route that this test does not know", () => {
    const found = FILES.flatMap((file) => expressionsIn(read(file)));
    expect([...new Set(found)].sort()).toEqual([...KNOWN_EXPRESSIONS].sort());
  });

  it("US-QS-15 every route has at least one screen in the register", () => {
    const covered = new Set(REGISTER.map(routeOf));
    expect(ROUTES.filter((route) => !covered.has(route))).toEqual([]);
  });

  it("US-QS-15 every route named in the register is a route of the app", () => {
    const known = new Set(ROUTES);
    const unknown = REGISTER.filter((s) => !known.has(routeOf(s)));
    expect(unknown.map((s) => s.id)).toEqual([]);
  });
});
