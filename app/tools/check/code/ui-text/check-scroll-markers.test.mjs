import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  baselineErrors,
  isScanned,
  isShared,
  scanSources,
  scrollXValues,
} from "./check-scroll-markers.mjs";

const SHARED_TABLE = "packages/web/src/shared/ui/table.tsx";
const PLAIN = "packages/web/src/catalog/example/example.tsx";

const baseline = (entries) => ({ maxTotal: entries.reduce((s, e) => s + e.count, 0), entries });

// The errors of one file, with the baseline of an empty list.
const errorsOf = (file, source) => scanSources(new Map([[file, source]])).errors;

describe("FR-QG-17 scan: which lines and files count", () => {
  it("FR-QG-17 counts a scroll class per line, also behind a variant, and not the classes that do not scroll", () => {
    const source = [
      '<div className="overflow-y-auto" />',
      '<div className="lg:overflow-x-scroll" />',
      '<div className="overflow-auto overflow-scroll" />',
      '<div className="overflow-hidden overflow-x-clip [overflow-wrap:anywhere]" />',
      '<div className="overflow-visible" />',
    ].join("\n");
    const { counts } = scanSources(new Map([[PLAIN, source]]));
    assert.equal(counts.get(PLAIN), 3, "three lines hold a scroll class; one line counts once");
  });

  it("FR-QG-17 scans non-test, non-story .ts and .tsx files only", () => {
    assert.equal(isScanned("packages/web/src/a/a.tsx"), true);
    assert.equal(isScanned("packages/web/src/a/a.ts"), true);
    assert.equal(isScanned("packages/web/src/a/a.test.tsx"), false);
    assert.equal(isScanned("packages/web/src/a/a.stories.tsx"), false);
    assert.equal(isScanned("packages/web/src/a/a.css"), false);
  });

  it("FR-QG-17 a shared component is its file and its parts, and a file with a longer name is not (flat shared/ui, issue 2509)", () => {
    assert.equal(isShared(SHARED_TABLE), true);
    assert.equal(isShared("packages/web/src/shared/ui/sheet.handle.tsx"), true);
    assert.equal(isShared("packages/web/src/shared/ui/table-extra.tsx"), false);
  });
});

describe("FR-QG-17 SM-4 and SM-5: shared components carry the marker and overscroll-contain", () => {
  it("FR-QG-17 a shared region with its marker and overscroll-contain passes", () => {
    const source = [
      "const Table = () => (",
      '  <div data-scroll-x="table" className="relative overflow-x-auto overscroll-contain">',
      "  </div>",
      ");",
    ].join("\n");
    assert.deepEqual(errorsOf(SHARED_TABLE, source), []);
  });

  it("FR-QG-17 SM-4: a shared region without data-scroll-region or data-scroll-x fails at its line", () => {
    const source = [
      "const Dialog = () => (",
      '  <div className="overflow-y-auto overscroll-contain" />',
      ");",
    ].join("\n");
    const errors = errorsOf("packages/web/src/shared/ui/dialog.tsx", source);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^SM-4 packages\/web\/src\/shared\/ui\/dialog\.tsx:2:/);
  });

  it("FR-QG-17 SM-5: a shared region without overscroll-contain fails, the marker alone is not enough", () => {
    const source = [
      "const Panel = () => (",
      '  <div data-scroll-region="" className="overflow-y-auto" />',
      ");",
    ].join("\n");
    const errors = errorsOf("packages/web/src/shared/ui/sheet.panel.tsx", source);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^SM-5 .*sheet\.panel\.tsx:2:/);
  });

  it("FR-QG-17 SM-4: a marker in another statement does not satisfy the region (the statement is the context)", () => {
    const source = [
      'export const Marked = () => <div data-scroll-region="" />;',
      'export const Scroller = () => <div className="overflow-y-auto overscroll-contain" />;',
    ].join("\n");
    const errors = errorsOf("packages/web/src/shared/ui/dialog.tsx", source);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^SM-4 .*dialog\.tsx:2:/);
  });

  it("FR-QG-17 two region lines of one statement report once", () => {
    const source = [
      "const Row = () => cn(",
      '  "overflow-x-auto",',
      '  "lg:overflow-y-auto",',
      ");",
    ].join("\n");
    const errors = errorsOf(SHARED_TABLE, source);
    assert.equal(errors.filter((e) => e.startsWith("SM-4")).length, 1);
    assert.equal(errors.filter((e) => e.startsWith("SM-5")).length, 1);
  });

  it("FR-QG-17 a region outside the shared components is no SM-4 or SM-5 finding; it is counted", () => {
    const source = '<div className="overflow-y-auto" />';
    assert.deepEqual(errorsOf(PLAIN, source), []);
    assert.equal(scanSources(new Map([[PLAIN, source]])).counts.get(PLAIN), 1);
  });
});

describe("FR-QG-17 SM-6: data-scroll-x takes one of table, cards, chips, tabs, row", () => {
  it("FR-QG-17 a value outside the list fails in any file", () => {
    const errors = errorsOf(PLAIN, '<div data-scroll-x="rows" />');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^SM-6 .*example\.tsx:1: data-scroll-x takes "rows"/);
  });

  it("FR-QG-17 an expression with a listed literal passes, the object form of the tab strip too", () => {
    assert.deepEqual(scrollXValues('"data-scroll-x": wrap ? undefined : "tabs",'), ["tabs"]);
    assert.deepEqual(scrollXValues('<div data-scroll-x={"cards"} />'), ["cards"]);
    assert.deepEqual(errorsOf(PLAIN, '"data-scroll-x": wrap ? undefined : "tabs",'), []);
  });

  it("FR-QG-17 a value without a string literal fails: it cannot be checked", () => {
    assert.deepEqual(scrollXValues("<div data-scroll-x={kind} />"), [null]);
    assert.match(errorsOf(PLAIN, "<div data-scroll-x={kind} />")[0], /no string literal/);
  });
});

describe("FR-QG-17 baseline ratchet (SM-1 to SM-3)", () => {
  it("FR-QG-17 exact counts pass", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.deepEqual(baselineErrors(new Map([["a.tsx", 2]]), b), []);
  });

  it("FR-QG-17 SM-1: a rise, and a new file with no entry, fail", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.match(baselineErrors(new Map([["a.tsx", 3]]), b)[0], /^SM-1 a\.tsx: 3 .* allows 2/);
    const fresh = baselineErrors(
      new Map([
        ["a.tsx", 2],
        ["b.tsx", 1],
      ]),
      b,
    );
    assert.match(fresh[0], /^SM-1 b\.tsx: 1 .* allows 0/);
  });

  it("FR-QG-17 SM-2: a fall fails with the baseline can shrink, lower it message", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.match(
      baselineErrors(new Map([["a.tsx", 1]]), b)[0],
      /^SM-2 a\.tsx: 1 scroll region line\(s\), baseline can shrink, lower it from 2$/,
    );
  });

  it("FR-QG-17 SM-2: a file with no region line left fails until its entry is removed", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.match(
      baselineErrors(new Map(), b)[0],
      /^SM-2 a\.tsx: no scroll region line left, baseline can shrink, remove the entry$/,
    );
  });

  it("FR-QG-17 SM-2: maxTotal above the entries sum fails until it is lowered", () => {
    const b = { maxTotal: 5, entries: [{ file: "a.tsx", count: 2 }] };
    assert.match(
      baselineErrors(new Map([["a.tsx", 2]]), b)[0],
      /^SM-2 maxTotal is 5, the entries add up to 2/,
    );
  });

  it("FR-QG-17 SM-3: entries above maxTotal fail", () => {
    const b = { maxTotal: 1, entries: [{ file: "a.tsx", count: 2 }] };
    assert.match(
      baselineErrors(new Map([["a.tsx", 2]]), b)[0],
      /^SM-3 the entries count 2 .* maxTotal is 1/,
    );
  });
});

describe("FR-QG-17 a clean tree passes end to end", () => {
  it("FR-QG-17 a shared component with markers and a plain file without regions pass against an empty baseline", () => {
    const files = new Map([
      [
        SHARED_TABLE,
        '<div data-scroll-x="table" className="overflow-x-auto overscroll-contain" />',
      ],
      [PLAIN, "<p>no scroll here</p>"],
    ]);
    const { counts, errors } = scanSources(files);
    assert.deepEqual(errors, []);
    assert.deepEqual(baselineErrors(counts, baseline([])), []);
  });
});
