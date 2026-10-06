import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  baselineFindings,
  baselineName,
  expectedBaselines,
  snapshotStoryIds,
} from "./ds-snapshots.lib.mjs";

const entry = (id, importPath, type = "story") => ({ id, importPath, type });
const index = {
  entries: {
    a: entry("ui-button--default", "./src/components/ui/button.stories.tsx"),
    b: entry("shared-appshell--default", "./src/components/shared/app-shell.stories.tsx"),
    c: entry("ui-button--docs", "./src/components/ui/button.stories.tsx", "docs"),
    d: entry("ds-snapshot-fixture-padding--default", "./.storybook/conformance-fixtures/p.tsx"),
  },
};

describe("QG-U5 · US-QS-07 · snapshot stories and baselines", () => {
  it("QG-U5 · snapshots only the stories of components/ui, not shared, docs or fixtures", () => {
    assert.deepEqual(snapshotStoryIds(index), ["ui-button--default"]);
  });

  it("QG-U5 · the self-test run snapshots only its fixture", () => {
    assert.deepEqual(snapshotStoryIds(index, { fixtures: true }), [
      "ds-snapshot-fixture-padding--default",
    ]);
  });

  it("QG-U5 · expects one baseline per story in light and dark", () => {
    assert.deepEqual(expectedBaselines(["x--a"]), ["x--a--light.png", "x--a--dark.png"]);
    assert.equal(baselineName("x--a", "dark"), "x--a--dark.png");
  });

  it("QG-U5 · passes when baselines and stories match", () => {
    assert.deepEqual(baselineFindings(["a.png", "b.png"], ["b.png", "a.png", "README.md"]), []);
  });

  it("QG-U5 · fails when a story has no baseline", () => {
    const f = baselineFindings(["a.png", "b.png"], ["a.png"]);
    assert.equal(f.length, 1);
    assert.match(f[0], /b\.png.*no baseline.*make ds-snapshots/);
  });

  it("QG-U5 · fails when a baseline has no story (stale)", () => {
    const f = baselineFindings(["a.png"], ["a.png", "old.png"]);
    assert.equal(f.length, 1);
    assert.match(f[0], /old\.png.*stale/);
  });
});
