import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, after } from "node:test";
import { check, inventoryNames, report, warnings } from "./check-components.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

// Runs check on a web package with these files (paths relative to src) and this design-system doc (none: no file).
function run(files, doc) {
  const dir = tempDir("components-");
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, "src", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  const inventoryFile = path.join(dir, "design-system.md");
  if (doc !== undefined) fs.writeFileSync(inventoryFile, doc);
  return check({ webDir: dir, inventoryFile });
}

const component = "export const X = () => null;\n";
const story = "export const Default = {};\n";
// An inventory with a header row and one row per given line.
const table = (...rows) => ["| Component | Path |", "|---|---|", ...rows].join("\n") + "\n";

describe("US-DEV-05 · components-check lists shared components without a story", () => {
  it("US-DEV-05 · a component folder without a story is listed as noStory", () => {
    const r = run({ "shared/ui/button/button.tsx": component }, "");
    assert.deepEqual(r.components, ["shared/ui/button/button.tsx"]);
    assert.deepEqual(r.noStory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · a component folder with its story next to it is not listed", () => {
    const r = run(
      { "shared/ui/button/button.tsx": component, "shared/ui/button/button.stories.tsx": story },
      "",
    );
    assert.deepEqual(r.noStory, []);
  });

  it("US-DEV-05 · flat layout: x.tsx with x.stories.tsx passes, a flat x.tsx without one is listed", () => {
    const r = run(
      {
        "shared/ui/badge.tsx": component,
        "shared/ui/badge.stories.tsx": story,
        "shared/ui/label.tsx": component,
      },
      "",
    );
    assert.deepEqual(r.components, ["shared/ui/badge.tsx", "shared/ui/label.tsx"]);
    assert.deepEqual(r.noStory, ["shared/ui/label.tsx"]);
  });

  it("US-DEV-05 · a sibling's stories file in the same folder does not count, only <name>.stories.tsx does", () => {
    const r = run(
      { "shared/ui/button/button.tsx": component, "shared/ui/button/other.stories.tsx": story },
      "",
    );
    assert.deepEqual(r.noStory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · the four shared folders are scanned at any depth, other folders are not", () => {
    const r = run(
      {
        "shared/lists/a/b/c/c.tsx": component,
        "shared/feedback/undo-row/undo-row.tsx": component,
        "app/frame/side-nav/side-nav.tsx": component,
        "shared/species-name/species-name.tsx": component,
      },
      "",
    );
    assert.deepEqual(r.components, [
      "shared/feedback/undo-row/undo-row.tsx",
      "shared/lists/a/b/c/c.tsx",
    ]);
  });
});

describe("US-DEV-05 · a story in a parent folder counts for the components below it (d-143)", () => {
  it("US-DEV-05 · a parent folder's stories file covers a component one folder below it", () => {
    const r = run(
      {
        "shared/ui/overlays/sheet/sheet-panel/sheet-panel.tsx": component,
        "shared/ui/overlays/sheet/sheet.stories.tsx": story,
      },
      "",
    );
    assert.deepEqual(r.noStory, []);
  });

  it("US-DEV-05 · a story two folders up covers a component (grandparent folder)", () => {
    const r = run(
      {
        "shared/ui/card/part/picture/picture.tsx": component,
        "shared/ui/card/card.stories.tsx": story,
      },
      "",
    );
    assert.deepEqual(r.noStory, []);
  });

  it("US-DEV-05 · the shared root's stories file covers a component folder below it (root inclusive)", () => {
    const r = run(
      { "shared/ui/button/button.tsx": component, "shared/ui/button.stories.tsx": story },
      "",
    );
    assert.deepEqual(r.noStory, []);
  });

  it("US-DEV-05 · a component with no stories file in any folder above it is still listed", () => {
    const r = run(
      {
        "shared/ui/overlays/unsaved-input-dialog/unsaved-question/unsaved-question.tsx": component,
        "shared/ui/overlays/unsaved-input-dialog/unsaved-input-dialog.tsx": component,
        "shared/ui/card/card.stories.tsx": story,
        "shared/ui/other/other.tsx": component,
      },
      "",
    );
    assert.deepEqual(r.noStory, [
      "shared/ui/other/other.tsx",
      "shared/ui/overlays/unsaved-input-dialog/unsaved-input-dialog.tsx",
      "shared/ui/overlays/unsaved-input-dialog/unsaved-question/unsaved-question.tsx",
    ]);
  });

  it("US-DEV-05 · a story of another shared root does not cover a component", () => {
    const r = run(
      {
        "shared/ui/button/button.tsx": component,
        "shared/patterns/patterns.stories.tsx": story,
      },
      "",
    );
    assert.deepEqual(r.noStory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · a story below a component does not cover it, a parent covers children only", () => {
    const r = run(
      {
        "shared/ui/card/card.tsx": component,
        "shared/ui/card/part/part.stories.tsx": story,
      },
      "",
    );
    assert.deepEqual(r.noStory, ["shared/ui/card/card.tsx"]);
  });

  it("US-DEV-05 · flat layout unchanged: a flat component needs its own <name>.stories.tsx, a sibling's does not cover it", () => {
    // The root's badge.stories.tsx does not cover the flat label.tsx next to it: a flat component's own folder is its root.
    const r = run({ "shared/ui/label.tsx": component, "shared/ui/badge.stories.tsx": story }, "");
    assert.deepEqual(r.noStory, ["shared/ui/label.tsx"]);
  });
});

describe("US-DEV-05 · helper files with a further dot segment are no components", () => {
  it("US-DEV-05 · stories, tests, slots, guards, parts and helpers are not listed", () => {
    const r = run(
      {
        "shared/ui/form-bar/form-bar.slot.tsx": component,
        "shared/ui/form-bar/form-bar.page.tsx": component,
        "shared/ui/layer/layer.guard.tsx": component,
        "shared/ui/layer/layer.parts.tsx": component,
        "shared/ui/layer/layer.test-helpers.tsx": component,
        "shared/ui/layer/layer.test.tsx": component,
        "shared/ui/layer/layer.stories.tsx": story,
        "shared/ui/layer/helpers.ts": component,
      },
      "",
    );
    assert.deepEqual(r.components, []);
    assert.deepEqual(r.noStory, []);
    assert.deepEqual(r.noInventory, []);
  });
});

describe("US-DEV-05 · components-check lists shared components without an inventory line", () => {
  it("US-DEV-05 · a component without any inventory row is listed as noInventory", () => {
    const r = run(
      { "shared/ui/button/button.tsx": component },
      table("| `Other` | `shared/ui/other/` |"),
    );
    assert.deepEqual(r.noInventory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · a folder row, a file row and a PascalCase name row each count as an inventory line", () => {
    const r = run(
      {
        "shared/ui/button/button.tsx": component,
        "shared/ui/badge.tsx": component,
        "shared/ui/label/label.tsx": component,
      },
      table(
        "| `Button` | `shared/ui/button/` |",
        "| `Badge` | `shared/ui/badge.tsx` |",
        "| `Label` | (no path) |",
      ),
    );
    assert.deepEqual(r.noInventory, []);
  });

  it("US-DEV-05 · a folder row covers its own component only, not one in a sub-folder", () => {
    const r = run(
      {
        "shared/ui/button/button.tsx": component,
        "shared/ui/button/network-gate/network-gate.tsx": component,
      },
      table("| `NetworkGate` | `shared/ui/button/network-gate/` |"),
    );
    assert.deepEqual(r.noInventory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · only table rows count: a name in running text is no inventory line", () => {
    const r = run(
      { "shared/ui/button/button.tsx": component },
      "The `Button` is used everywhere.\n" + table("| `Label` | x |"),
    );
    assert.deepEqual(r.noInventory, ["shared/ui/button/button.tsx"]);
  });

  it("US-DEV-05 · inventory names drop the trailing slash and skip lines outside tables", () => {
    const names = inventoryNames("`prose-name`\n| `Button` | `shared/ui/button/` |\n");
    assert.deepEqual([...names].sort(), ["Button", "shared/ui/button"]);
  });

  it("US-DEV-05 · a missing inventory file lists every component and does not throw", () => {
    const dir = tempDir("components-");
    const p = path.join(dir, "src/shared/ui/button");
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "button.tsx"), component);
    const r = check({ webDir: dir, inventoryFile: path.join(dir, "missing.md") });
    assert.deepEqual(r.noInventory, ["shared/ui/button/button.tsx"]);
  });
});

describe("US-DEV-05 · components-check prints warnings only and exits 0", () => {
  it("US-DEV-05 · one warning line per gap, missing stories first", () => {
    const r = run(
      {
        "shared/ui/a/a.tsx": component,
        "shared/ui/b/b.tsx": component,
        "shared/ui/b/b.stories.tsx": story,
      },
      table("| `B` | `shared/ui/b/` |"),
    );
    assert.deepEqual(r.noStory, ["shared/ui/a/a.tsx"]);
    assert.deepEqual(r.noInventory, ["shared/ui/a/a.tsx"]);
    const lines = warnings(r);
    assert.equal(lines.length, 2);
    assert.equal(
      lines[0],
      "shared/ui/a/a.tsx has no stories file in its folder or a parent folder",
    );
    assert.match(
      lines[1],
      /^shared\/ui\/a\/a\.tsx has no line in docs\/guides\/reference\/design-system\.md/,
    );
  });

  it("US-DEV-05 · a check that cannot run is reported and does not throw", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    // A folder where the inventory file should be: reading it fails, which report must catch.
    const result = report({
      webDir: tempDir("components-"),
      inventoryFile: tempDir("components-"),
    });
    assert.equal(result, undefined);
    assert.match(warn.mock.calls.map((c) => c.arguments[0]).join("\n"), /did not run/);
  });

  it("US-DEV-05 · the command exits 0 and prints its summary", () => {
    const script = path.join(here, "check-components.mjs");
    const out = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^components-check: \d+ shared components, \d+ without a story/m);
  });
});
