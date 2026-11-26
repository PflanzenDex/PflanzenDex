import { expect, test } from "@playwright/test";
import type { CellRecord } from "../../../support/device-check/report.cells";
import {
  summaryJson,
  summaryMarkdown,
  type RunMeta,
} from "../../../support/device-check/report.render";

// Self-tests of the device check (US-DEV-01, issue 2504), part 3: the Markdown and JSON summaries say what was measured. Pure: no
// browser, no server. Parts 1 and 2 are display-checks.device.self.spec.ts and display-checks.device.self-checks.spec.ts.

test.describe("US-DEV-01 self-test: the Markdown and JSON summaries", () => {
  const meta: RunMeta = {
    startedAt: "2026-11-26T10-00-00",
    filters: "FLOW=water-plant",
    phone: "not asked",
    notes: ["TalkBack by hand."],
  };
  const failing: CellRecord = {
    key: "water-plant-iphone16-light-100",
    cell: {
      kind: "flow",
      id: "water-plant",
      screen: "collection-plant-overview",
      device: "iphone16",
      theme: "light",
      text: "100",
      forced: false,
    },
    status: "fail",
    device: {
      label: "iPhone 16",
      width: 393,
      height: 852,
      measuredWidth: 393,
      measuredHeight: 852,
      rem: 16,
    },
    checks: [
      {
        name: "still: nothing moves under the finger",
        ok: false,
        measured: "5 controls compared",
        detail: "messen moved 28 px up",
      },
    ],
    shots: ["shots/water-plant-iphone16-light-100-screen.png"],
    ms: 1000,
  };

  test("US-DEV-01 the Markdown summary has the table, the failing detail, the screenshots and the limits", () => {
    const md = summaryMarkdown([failing], meta);
    expect(md).toContain("| flow water-plant | iPhone 16, 393x852 | light | 100 % | fail |");
    expect(md).toContain("messen moved 28 px up");
    expect(md).toContain("- shots/water-plant-iphone16-light-100-screen.png");
    expect(md).toContain("## Not checked");
  });

  test("US-DEV-01 the JSON summary carries the counts and every cell", () => {
    const json = JSON.parse(summaryJson([failing], meta)) as {
      counts: Record<string, number>;
      cells: unknown[];
    };
    expect(json.counts["fail"]).toBe(1);
    expect(json.cells.length).toBe(1);
  });
});
