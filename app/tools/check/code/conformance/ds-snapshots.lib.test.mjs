import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  baselineFindings,
  baselineName,
  expectedBaselines,
  expectedPageBaselines,
  pageBaselineName,
  pageStoryIds,
  PAGE_SIZES,
  quarantineFindings,
  snapshotStoryIds,
} from "./ds-snapshots.lib.mjs";

const entry = (id, importPath, type = "story") => ({ id, importPath, type });
const index = {
  entries: {
    a: entry("ui-button--default", "./src/shared/ui/button.stories.tsx"),
    b: entry("shared-appshell--default", "./src/shared/patterns/app-shell.stories.tsx"),
    c: entry("ui-button--docs", "./src/shared/ui/button.stories.tsx", "docs"),
    d: entry("ds-snapshot-fixture-padding--default", "./.storybook/conformance-fixtures/p.tsx"),
  },
};

describe("QG-U5 · US-QS-07 · snapshot stories and baselines", () => {
  it("QG-U5 · snapshots only the stories of shared/ui, not shared/patterns, docs or fixtures", () => {
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

describe("QG-U5 · FR-QG-27 · page states and their baselines", () => {
  const pages = {
    entries: {
      a: {
        ...entry("seiten-heute--phone", "./src/lib/page-stories/screens/heute/h.stories.tsx"),
        tags: ["dev"],
      },
      b: {
        ...entry("seiten-heute--phone-dark", "./src/lib/page-stories/screens/heute/h.stories.tsx"),
      },
      c: entry("seiten-heute--nothing-due", "./src/lib/page-stories/screens/heute/h.stories.tsx"),
      d: entry("ui-button--default", "./src/shared/ui/button.stories.tsx"),
      e: entry("ds-snapshot-fixture-page--default", "./.storybook/conformance-fixtures/page.tsx"),
      f: entry("ds-snapshot-fixture-padding--default", "./.storybook/conformance-fixtures/p.tsx"),
    },
  };

  it("QG-U5 · FR-QG-27 · snapshots page states, not their variants, ui stories or fixtures", () => {
    assert.deepEqual(pageStoryIds(pages), ["seiten-heute--nothing-due", "seiten-heute--phone"]);
    assert.deepEqual(pageStoryIds(pages, { fixtures: true }), [
      "ds-snapshot-fixture-page--default",
    ]);
    assert.deepEqual(snapshotStoryIds(pages, { fixtures: true }), [
      "ds-snapshot-fixture-padding--default",
    ]);
  });

  it("QG-U5 · FR-QG-27 · expects 5 sizes x light and dark per page and names them by size", () => {
    assert.equal(PAGE_SIZES.length, 5);
    const names = expectedPageBaselines(["p"]);
    assert.equal(names.length, 10);
    assert.ok(names.includes("p--1920x1080--dark.png"));
    assert.equal(pageBaselineName("p", PAGE_SIZES[1], "light"), "p--390x844--light.png");
  });

  it("QG-U5 · FR-QG-27 · a new page without baselines fails, a quarantined picture is not expected", () => {
    const f = baselineFindings(expectedPageBaselines(["p"]), []);
    assert.equal(f.length, 10);
    const q = expectedPageBaselines(["p"], ["p--360x640--light.png"]);
    assert.equal(q.length, 9);
    assert.deepEqual(baselineFindings(q, q), []);
  });

  it("QG-U5 · FR-QG-27 · the quarantine only shrinks and names existing pictures", () => {
    const entry1 = { file: "p--360x640--light.png", reason: "x" };
    assert.deepEqual(quarantineFindings({ maxEntries: 1, entries: [entry1] }, ["p"]), []);
    assert.match(quarantineFindings({ maxEntries: 0, entries: [entry1] }, ["p"])[0], /maxEntries/);
    assert.match(quarantineFindings({ maxEntries: 1, entries: [entry1] }, ["q"])[0], /remove it/);
  });
});
