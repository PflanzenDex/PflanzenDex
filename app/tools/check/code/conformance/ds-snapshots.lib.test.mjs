import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  replacePngs,
  seedStaging,
  snapshotStoryIds,
  updateMode,
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
        ...entry("seiten-heute--phone", "./src/app/stories/screens/heute/h.stories.tsx"),
        tags: ["dev"],
      },
      b: {
        ...entry("seiten-heute--phone-dark", "./src/app/stories/screens/heute/h.stories.tsx"),
      },
      c: entry("seiten-heute--nothing-due", "./src/app/stories/screens/heute/h.stories.tsx"),
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

describe("QG-U5 · US-QS-07 · an update replaces the baselines only when it passes", () => {
  it("QG-U5 · US-QS-07 · replacePngs moves the staged pictures in, removes stale ones and keeps other files (#2286)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ds-swap-"));
    try {
      const staged = path.join(root, "staged");
      const target = path.join(root, "baselines");
      fs.mkdirSync(staged);
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, "a.png"), "old-a"); // replaced by the staged picture
      fs.writeFileSync(path.join(target, "stale.png"), "old"); // no story renders it any more
      fs.writeFileSync(path.join(target, "README.md"), "keep"); // not a picture, stays
      fs.writeFileSync(path.join(staged, "a.png"), "new-a");
      fs.writeFileSync(path.join(staged, "b.png"), "new-b"); // a new story
      replacePngs(staged, target);
      assert.deepEqual(fs.readdirSync(target).sort(), ["README.md", "a.png", "b.png"]);
      assert.equal(fs.readFileSync(path.join(target, "a.png"), "utf8"), "new-a");
      assert.equal(fs.readFileSync(path.join(target, "b.png"), "utf8"), "new-b");
      assert.equal(fs.readFileSync(path.join(target, "README.md"), "utf8"), "keep");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("QG-U5 · US-QS-07 · an update rewrites only the changed baselines (#2641)", () => {
  it("QG-U5 · US-QS-07 · an update asks Playwright for the changed pictures only; a check writes none", () => {
    assert.equal(updateMode(true), "changed");
    assert.equal(updateMode(false), "none");
  });

  it("QG-U5 · US-QS-07 · seedStaging copies the expected baselines that exist and leaves out stale ones", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ds-seed-"));
    try {
      const baselines = path.join(root, "baselines");
      const staged = path.join(root, "staged");
      fs.mkdirSync(baselines);
      fs.writeFileSync(path.join(baselines, "a.png"), "a"); // expected, copied
      fs.writeFileSync(path.join(baselines, "stale.png"), "s"); // no story renders it, not copied
      seedStaging(baselines, staged, ["a.png", "new.png"]); // new.png has no baseline yet
      assert.deepEqual(fs.readdirSync(staged).sort(), ["a.png"]);
      assert.equal(fs.readFileSync(path.join(staged, "a.png"), "utf8"), "a");
      // After the swap the stale picture goes away and the unchanged one keeps its bytes.
      replacePngs(staged, baselines);
      assert.deepEqual(fs.readdirSync(baselines).sort(), ["a.png"]);
      assert.equal(fs.readFileSync(path.join(baselines, "a.png"), "utf8"), "a");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
