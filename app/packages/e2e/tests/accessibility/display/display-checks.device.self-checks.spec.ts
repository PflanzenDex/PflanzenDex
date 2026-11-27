import { expect, test } from "@playwright/test";
import { layoutProblems } from "../../../support/display/display";
import { cellName, type Cell } from "../../../support/device-check/device";
import {
  boolCheck,
  floorCheck,
  focusCheck,
  heightCheck,
  liveCheck,
  overflowCheck,
  stillCheck,
  textCheck,
  toastCheck,
  type Boxes,
} from "../../../support/device-check/check";
import type { CellRecord } from "../../../support/device-check/report.cells";
import { countsOf, rowOf } from "../../../support/device-check/report.render";

// Self-tests of the device check (US-DEV-01, issue 2504), part 2: the reusable checks judge fake measurements, and the summary
// says what was measured. Pure: no browser, no server. Part 1 (filters, matrix, flows) is display-checks.device.self.spec.ts.

/** Boxes of the named controls at the given positions (80 x 44 px each); a name without a position is not shown. */
const boxes = (at: Record<string, { x: number; y: number }>, names: string[]): Boxes =>
  Object.fromEntries(
    names.map((n) => [n, at[n] ? { ...at[n], width: 80, height: 44 } : null]),
  ) as Boxes;

test.describe("US-DEV-01 self-test: the controls and the page do not move under the finger", () => {
  const names = ["messen", "behandeln"];
  const before = boxes({ messen: { x: 10, y: 700 }, behandeln: { x: 150, y: 700 } }, names);

  test("US-DEV-01 a control that moves under the finger fails by name", () => {
    const moved = boxes({ messen: { x: 10, y: 672 }, behandeln: { x: 150, y: 700 } }, names);
    const bad = stillCheck(before, moved);
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain("messen moved 28 px up");
  });

  test("US-DEV-01 a move within 1 px is no move, and a control that is gone is one", () => {
    const fine = boxes({ messen: { x: 10.4, y: 700.5 }, behandeln: { x: 150, y: 700 } }, names);
    expect(stillCheck(before, fine).ok).toBe(true);
    const gone = stillCheck(before, boxes({ behandeln: { x: 150, y: 700 } }, names));
    expect(gone.detail).toContain("messen is gone");
  });

  test("US-DEV-01 a page that grows by a result line fails the height check", () => {
    expect(heightCheck(1200, 1200).ok).toBe(true);
    expect(heightCheck(1200, 1252).detail).toContain("52 px");
  });
});

test.describe("US-DEV-01 self-test: focus, announcements and toasts", () => {
  test("US-DEV-01 the focus on the body after an action fails; the focus on an element passes", () => {
    expect(focusCheck("BODY").ok).toBe(false);
    expect(focusCheck(null).ok).toBe(false);
    expect(focusCheck('button "Rückgängig"').ok).toBe(true);
  });

  test("US-DEV-01 a result is announced only when a live region says it", () => {
    expect(liveCheck(["„Pflanze“ als gegossen eingetragen."], "als gegossen eingetragen").ok).toBe(
      true,
    );
    expect(liveCheck([], "als gegossen eingetragen").ok).toBe(false);
  });

  test("US-DEV-01 a toast for a success fails the toast check", () => {
    expect(toastCheck(0).ok).toBe(true);
    expect(toastCheck(1).measured).toBe("1 toast");
  });
});

test.describe("US-DEV-01 self-test: overflow, floors, text size and yes-or-no checks", () => {
  test("US-DEV-01 a sideways problem fails the overflow check; a vertical cut-off does not", () => {
    expect(overflowCheck(["page scrolls sideways (420 > 393)"]).ok).toBe(false);
    expect(overflowCheck(["sticks out (380..420 of 393): button"]).ok).toBe(false);
    expect(overflowCheck(["cuts off below (300 > 200): div"]).ok).toBe(true);
  });

  test("US-DEV-01 a size below the floor fails the floor check; other findings do not", () => {
    expect(floorCheck([["frame", "frame: page 1.20"]]).ok).toBe(true);
    const low = floorCheck([["size", "size: row li is 20 px high (at least 36 px)"]]);
    expect(low.ok).toBe(false);
    expect(low.detail).toContain("at least 36 px");
  });

  test("US-DEV-01 the text size check reads 32 px as 200 % and 16 px as 100 %", () => {
    expect(textCheck(32, "200").ok).toBe(true);
    expect(textCheck(16, "200").ok).toBe(false);
    expect(textCheck(16, "100").ok).toBe(true);
  });

  test("US-DEV-01 a yes-or-no property fails when the page reports no", () => {
    expect(boolCheck("online: navigator.onLine is true (PF-040)", false, "false").ok).toBe(false);
  });
});

test.describe("US-DEV-01 self-test: the table and the counts of the summary", () => {
  const cell: Cell = {
    kind: "flow",
    id: "water-plant",
    screen: "collection-plant-overview",
    device: "iphone16",
    theme: "light",
    text: "100",
    forced: false,
  };
  const record = (over: Partial<CellRecord>): CellRecord => ({
    key: cellName(cell),
    cell,
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
      { name: "no toast for a success", ok: true, measured: "0 toasts" },
    ],
    shots: ["shots/water-plant-iphone16-light-100-screen.png"],
    ms: 1000,
    ...over,
  });

  test("US-DEV-01 the table row names the flow, the device, the status and the failing check", () => {
    expect(countsOf([record({}), record({ status: "pass", checks: [] })])).toEqual({
      pass: 1,
      fail: 1,
      skipped: 0,
      error: 0,
    });
    const row = rowOf(record({}));
    expect(row).toContain("flow water-plant");
    expect(row).toContain("still: nothing moves under the finger");
    expect(row).toContain("fail");
  });

  test("US-DEV-01 a phone that is not attached is a skipped cell with its reason, not a failure", () => {
    const phone: Cell = { ...cell, kind: "screen", id: "today", screen: "today", device: "phone" };
    const skipped = record({
      cell: phone,
      status: "skipped",
      reason: "no phone attached",
      checks: [],
    });
    expect(countsOf([skipped]).skipped).toBe(1);
    expect(rowOf(skipped)).toContain("skipped no phone attached");
  });
});

test.describe("US-DEV-01 self-test: intentional sideways scrollers", () => {
  const rows = `<style>body{margin:0}.row{display:flex;gap:8px;overflow-x:auto;width:300px}
    .row>*{flex:none;width:200px;height:40px}</style>
    <div class="row" data-scroll-x="cards"><div>a</div><div>b</div><div>c</div></div>
    <div class="row" data-scroll-x="chips"><span>x</span><span>y</span><span>z</span></div>`;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
  });

  test("US-DEV-01 a card row and a chip row pass the overflow check", async ({ page }) => {
    await page.setContent(rows);
    expect((await layoutProblems(page, { skipScrollX: true })).join("\n")).toBe("");
  });

  test("US-DEV-01 a real overflow next to the scrollers still fails", async ({ page }) => {
    await page.setContent(`${rows}<p style="width:600px;margin:0">sticks out</p>`);
    const problems = await layoutProblems(page, { skipScrollX: true });
    expect(overflowCheck(problems).ok).toBe(false);
    expect(problems.join("\n")).toContain("sticks out");
  });

  test("US-DEV-01 without the mark, a scroller's content still counts", async ({ page }) => {
    await page.setContent(rows.replaceAll("data-scroll-x", "data-x"));
    expect(overflowCheck(await layoutProblems(page, { skipScrollX: true })).ok).toBe(false);
  });
});
