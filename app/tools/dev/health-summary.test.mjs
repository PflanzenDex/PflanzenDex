// Tests for the exception-marker count of the health report (US-QG-08).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markerCounts, markersToMarkdown } from "./health-summary.mjs";

const ZERO = [
  { name: "STRUCTURE_IGNORE", withReason: 0, withoutReason: 0 },
  { name: "MAX_LINES_IGNORE", withReason: 0, withoutReason: 0 },
  { name: "COMPLEXITY_IGNORE", withReason: 0, withoutReason: 0 },
];

describe("US-QG-08 exception markers in the health report", () => {
  it("US-QG-08: lists every marker kind with zero when no file has a marker, so a zero is visible", () => {
    assert.deepEqual(markerCounts([{ file: "a.ts", src: "export const a = 1;\n" }]), ZERO);
    assert.deepEqual(markerCounts([]), ZERO);
  });

  it("US-QG-08: counts the markers with a reason per kind over all files", () => {
    const files = [
      { file: "a.ts", src: "// COMPLEXITY_IGNORE: parser table\nexport const a = 1;\n" },
      { file: "b.ts", src: "// COMPLEXITY_IGNORE: state machine\nexport const b = 1;\n" },
      { file: "c.tsx", src: "/* MAX_LINES_IGNORE: generated file */\nexport const c = 1;\n" },
    ];
    assert.deepEqual(markerCounts(files), [
      { name: "STRUCTURE_IGNORE", withReason: 0, withoutReason: 0 },
      { name: "MAX_LINES_IGNORE", withReason: 1, withoutReason: 0 },
      { name: "COMPLEXITY_IGNORE", withReason: 2, withoutReason: 0 },
    ]);
  });

  it("US-QG-08: a marker without a reason is counted apart, not as an honored exception", () => {
    const files = [{ file: "a.ts", src: "// STRUCTURE_IGNORE:\nexport const a = 1;\n" }];
    assert.deepEqual(markerCounts(files)[0], {
      name: "STRUCTURE_IGNORE",
      withReason: 0,
      withoutReason: 1,
    });
  });

  it("US-QG-08: only the first five lines count, as in the gates", () => {
    const late = "\n\n\n\n\n// COMPLEXITY_IGNORE: too late\nexport const a = 1;\n";
    assert.deepEqual(markerCounts([{ file: "a.ts", src: late }]), ZERO);
  });

  it("US-QG-08: prints every kind as a Markdown row, zeros included", () => {
    assert.equal(
      markersToMarkdown(ZERO),
      [
        "### Exception markers (count per kind)",
        "",
        "| Marker | With reason | Without reason |",
        "|---|---|---|",
        "| STRUCTURE_IGNORE | 0 | 0 |",
        "| MAX_LINES_IGNORE | 0 | 0 |",
        "| COMPLEXITY_IGNORE | 0 | 0 |",
        "",
      ].join("\n"),
    );
  });
});
