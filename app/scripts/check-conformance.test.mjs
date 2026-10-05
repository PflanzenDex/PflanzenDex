import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  axeFindings,
  focusFindings,
  overlayFindings,
  parseAllowlist,
  targetFindings,
} from "./conformance-rules.mjs";

const ctx = { story: "ui-button--sizes", scheme: "light" };

describe("QG-U5 · conformance run, touch targets (DS-15)", () => {
  it("QG-U5 · flags a 36px target and names story and element", () => {
    const out = targetFindings(ctx, [{ selector: "button.sm", width: 120, height: 36 }]);
    assert.equal(out.length, 1);
    assert.match(out[0], /ui-button--sizes/);
    assert.match(out[0], /button\.sm/);
    assert.match(out[0], /120x36/);
    assert.match(out[0], /DS-15/);
  });

  it("QG-U5 · flags a target that is narrow even when tall enough", () => {
    assert.equal(targetFindings(ctx, [{ selector: "a", width: 40, height: 44 }]).length, 1);
  });

  it("QG-U5 · accepts 44x44 and larger, with sub-pixel rounding", () => {
    const out = targetFindings(ctx, [
      { selector: "a", width: 44, height: 44 },
      { selector: "b", width: 343.5, height: 43.6 },
    ]);
    assert.deepEqual(out, []);
  });
});

describe("QG-U5 · conformance run, axe (DS-17/19/20)", () => {
  const violation = (impact, id = "label") => ({
    id,
    impact,
    help: "Form elements must have labels",
    nodes: [{ target: ["input"] }],
  });

  it("QG-U5 · fails an input without a label (serious)", () => {
    const out = axeFindings(ctx, [violation("critical")], []);
    assert.equal(out.length, 1);
    assert.match(out[0], /ui-button--sizes/);
    assert.match(out[0], /label/);
  });

  it("QG-U5 · ignores moderate and minor impact while reporting only serious and critical", () => {
    assert.deepEqual(axeFindings(ctx, [violation("moderate"), violation("minor")], []), []);
    assert.equal(axeFindings(ctx, [violation("serious")], []).length, 1);
  });

  it("QG-U5 · an allow-list entry with a reason suppresses exactly its story and rule", () => {
    const allow = [{ story: "ui-button--sizes", rule: "label", reason: "documented" }];
    assert.deepEqual(axeFindings(ctx, [violation("serious")], allow), []);
    assert.equal(axeFindings(ctx, [violation("serious", "color-contrast")], allow).length, 1);
    assert.equal(
      axeFindings({ ...ctx, story: "other--story" }, [violation("serious")], allow).length,
      1,
    );
  });
});

describe("QG-U5 · conformance run, allow-list", () => {
  it("QG-U5 · starts empty and parses", () => {
    assert.deepEqual(parseAllowlist('{ "entries": [] }'), []);
  });

  it("QG-U5 · rejects an entry without a written reason", () => {
    assert.throws(
      () => parseAllowlist('{ "entries": [{ "story": "a--b", "rule": "label" }] }'),
      /reason/,
    );
    assert.throws(
      () => parseAllowlist('{ "entries": [{ "story": "a--b", "rule": "label", "reason": " " }] }'),
      /reason/,
    );
  });

  it("QG-U5 · rejects a file without entries array", () => {
    assert.throws(() => parseAllowlist("{}"), /entries/);
  });
});

describe("QG-U5 · conformance run, focus indicator (DS-37)", () => {
  const plain = { outline: "rgb(0, 0, 0) none 0px", boxShadow: "none" };

  it("QG-U5 · flags an element whose style does not change on focus", () => {
    const out = focusFindings(ctx, [{ selector: "button", before: plain, after: plain }]);
    assert.equal(out.length, 1);
    assert.match(out[0], /DS-37/);
    assert.match(out[0], /button/);
  });

  it("QG-U5 · accepts a changed box-shadow ring or outline", () => {
    const ring = { ...plain, boxShadow: "rgb(0, 0, 255) 0px 0px 0px 2px" };
    const line = { outline: "rgb(0, 0, 255) solid 2px", boxShadow: "none" };
    assert.deepEqual(
      focusFindings(ctx, [
        { selector: "a", before: plain, after: ring },
        { selector: "b", before: plain, after: line },
      ]),
      [],
    );
  });
});

describe("QG-U5 · conformance run, overlays (DS-40)", () => {
  it("QG-U5 · flags an overlay that stays open on Esc", () => {
    const out = overlayFindings(ctx, [
      { trigger: "button", closedOnEsc: false, focusReturned: true },
    ]);
    assert.match(out.join("\n"), /Esc/);
  });

  it("QG-U5 · flags an overlay that does not return focus to its trigger", () => {
    const out = overlayFindings(ctx, [
      { trigger: "button", closedOnEsc: true, focusReturned: false },
    ]);
    assert.match(out.join("\n"), /focus/);
  });

  it("QG-U5 · accepts closing on Esc with focus back on the trigger, and trigger-less open overlays that close", () => {
    assert.deepEqual(
      overlayFindings(ctx, [
        { trigger: "button", closedOnEsc: true, focusReturned: true },
        { trigger: null, closedOnEsc: true, focusReturned: null },
      ]),
      [],
    );
  });
});
