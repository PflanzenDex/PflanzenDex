import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, documented, findGaps } from "./check-reference.mjs";
import { componentName, operationNames, routeKey } from "./reference-sources.mjs";

const appDoc =
  "Lists with `GET /species?q=` and `GET /species/:id`; writes go through `species.create`.";
const dsDoc = "| `Button` | `ui/button/` |\n\nWrap it: <EmptyState action={…} />";
const docs = { appDoc, dsDoc };
const none = { routes: [], operations: [], components: [] };

test("US-QG-10: a route named with another parameter name or a query counts as documented", () => {
  assert.ok(documented(appDoc).routes.has(routeKey("GET", "/species/:speciesId")));
  assert.ok(documented(appDoc).routes.has("GET /species"));
});

test("US-QG-10: RF-1 an undocumented API route fails with method, path and doc", () => {
  const gaps = findGaps({ ...none, routes: ["GET /species/:id", "POST /species"] }, docs);
  const [error] = compareBaseline(gaps, {});
  assert.match(error, /^RF-1 POST \/species is not named in docs\/guides\/reference\/app\.md/);
});

test("US-QG-10: RF-2 an undocumented core operation fails", () => {
  const gaps = findGaps({ ...none, operations: ["species.create", "wish.buy"] }, docs);
  assert.deepEqual(
    compareBaseline(gaps, {}).map((e) => e.split(" ").slice(0, 2).join(" ")),
    ["RF-2 wish.buy"],
  );
});

test("US-QG-10: RF-3 an undocumented shared component fails, a backticked or JSX name passes", () => {
  const gaps = findGaps({ ...none, components: ["Button", "EmptyState", "Banner"] }, docs);
  const errors = compareBaseline(gaps, {});
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /^RF-3 Banner is not named in docs\/guides\/reference\/design-system\.md/,
  );
});

test("US-QG-10: a gap in the baseline passes", () => {
  const gaps = findGaps({ ...none, routes: ["POST /species"] }, docs);
  assert.deepEqual(compareBaseline(gaps, { routes: ["POST /species"] }), []);
});

test("US-QG-10: RF-4 a baseline entry that is documented now or gone fails", () => {
  const gaps = findGaps({ ...none, operations: ["species.create"] }, docs);
  const errors = compareBaseline(gaps, { operations: ["species.create", "gone.op"] });
  assert.equal(errors.length, 2);
  assert.ok(errors.every((e) => e.startsWith("RF-4 ")));
});

test("US-QG-10: RF-5 a baseline entry that dev does not have fails", () => {
  const gaps = findGaps({ ...none, routes: ["POST /species"] }, docs);
  const [error] = compareBaseline(gaps, { routes: ["POST /species"] }, { routes: [] });
  assert.match(error, /^RF-5 POST \/species is not in the baseline on dev/);
});

test("US-QG-10: operation names come from defineOperation, also with type arguments", () => {
  const source = `import { defineOperation } from "../kernel";
export const a = defineOperation<{ name: string }, X>({
  name: "wish.rename",
  schema,
});
export const b = (deps) =>
  defineOperation({ schema, name: "wish.buy", run });`;
  assert.deepEqual(operationNames(source), ["wish.rename", "wish.buy"]);
});

test("US-QG-10: only <name>/<name>.tsx is a component, named in PascalCase", () => {
  assert.equal(componentName("ui/display/badge/badge.tsx"), "Badge");
  assert.equal(
    componentName("shared/responsive/responsive-table/responsive-table.tsx"),
    "ResponsiveTable",
  );
  assert.equal(componentName("shared/shell/shell.fixtures.tsx"), undefined);
  assert.equal(componentName("ui/button/button-base.tsx"), undefined);
});
