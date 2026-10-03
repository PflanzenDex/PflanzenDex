import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBaseline, parseFinding } from "./check-baseline.mjs";
import { worstFive, toMarkdown } from "./health-summary.mjs";

const entry = { rule: "max-params", file: "a.ts", function: "f", value: 5, date: "2026-10-03" };
const finding = { rule: "max-params", file: "a.ts", function: "f", value: 5 };

describe("US-QG-08 checkBaseline (FR-QG-17)", () => {
  it("passes when findings match the baseline exactly", () => {
    assert.deepEqual(checkBaseline([finding], { maxEntries: 1, entries: [entry] }), []);
    assert.deepEqual(checkBaseline([], { maxEntries: 0, entries: [] }), []);
  });
  it("BL-1: new violation not in the baseline", () => {
    const e = checkBaseline([finding], { maxEntries: 0, entries: [] });
    assert.match(e[0], /^BL-1 a\.ts f/);
  });
  it("BL-1: a baselined function that got worse", () => {
    const e = checkBaseline([{ ...finding, value: 6 }], { maxEntries: 1, entries: [entry] });
    assert.match(e[0], /^BL-1 /);
  });
  it("BL-2: improved or fixed entries must be updated or removed", () => {
    assert.match(
      checkBaseline([{ ...finding, value: 4 }], { maxEntries: 1, entries: [entry] })[0],
      /^BL-2 /,
    );
    assert.match(
      checkBaseline([], { maxEntries: 1, entries: [entry] })[0],
      /^BL-2 .*remove the entry/,
    );
  });
  it("BL-3: list grew beyond maxEntries", () => {
    const e = checkBaseline([finding], { maxEntries: 0, entries: [entry] });
    assert.ok(e.some((m) => m.startsWith("BL-3")));
  });
});

describe("parseFinding", () => {
  it("reads values from ESLint messages", () => {
    assert.deepEqual(
      parseFinding(
        "max-params",
        "Async function 'g' has too many parameters (5). Maximum allowed is 4.",
        1,
      ),
      { function: "g", value: 5 },
    );
    assert.deepEqual(
      parseFinding(
        "max-lines-per-function",
        "Function 'h' has too many lines (67). Maximum allowed is 60.",
        1,
      ),
      { function: "h", value: 67 },
    );
    assert.deepEqual(
      parseFinding("complexity", "Function 'k' has a complexity of 16. Maximum allowed is 15.", 1),
      { function: "k", value: 16 },
    );
    assert.deepEqual(
      parseFinding("max-depth", "Blocks are nested too deeply (5). Maximum allowed is 4.", 9),
      { function: "@line 9", value: 5 },
    );
    assert.deepEqual(
      parseFinding(
        "sonarjs/cognitive-complexity",
        "Refactor this function to reduce its Cognitive Complexity from 31 to the 30 allowed.",
        7,
      ),
      { function: "@line 7", value: 31 },
    );
  });
});

describe("health summary", () => {
  it("lists the five worst, highest first", () => {
    const fs = [3, 9, 1, 7, 5, 8, 2].map((value) => ({
      file: "x.ts",
      function: `f${value}`,
      value,
    }));
    assert.deepEqual(
      worstFive(fs).map((f) => f.value),
      [9, 8, 7, 5, 3],
    );
    assert.match(toMarkdown(worstFive(fs)), /\| x\.ts \| f9 \| 9 \|/);
  });
});
