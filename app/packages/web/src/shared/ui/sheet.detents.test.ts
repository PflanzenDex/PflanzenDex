import { describe, expect, it } from "vitest";
import {
  announcement,
  dragFrame,
  nearestDetent,
  releaseOf,
  sheetHeights,
  sheetKind,
  type Measure,
} from "./sheet.detents";

// US-QS-15, sheet and layer heights (owner decision 4 of 2026-11-21, issue 2412; owner answers 2026-11-21, issue 2415).

/** A window of 640 px with no status bar inset: half is 320 px, full is 640 px. */
const heights = sheetHeights(640, 0);

/** The measure of a sheet: 24 px root font size is not needed, so 16 px; the header is 90 px high. */
const measure = (over: Partial<Measure> = {}): Measure => ({
  height: 200,
  overflow: 0,
  chrome: 90,
  rem: 16,
  ...over,
});

describe("US-QS-15 · sheet heights", () => {
  it("US-QS-15 half is 50 % of the visible window height, full is the visible height minus the status bar", () => {
    expect(sheetHeights(640, 0)).toEqual({ half: 320, full: 640 });
    expect(sheetHeights(844, 47)).toEqual({ half: 422, full: 797 });
  });

  it("US-QS-15 a window of zero height gives no negative height", () => {
    expect(sheetHeights(0, 47)).toEqual({ half: 0, full: 0 });
  });
});

describe("US-QS-15 · fitting height, half height and full height", () => {
  it("US-QS-15 a sheet whose content fits within half the window opens at the height of its content (fit)", () => {
    expect(sheetKind(measure({ height: 250 }), heights)).toBe("fit");
  });

  it("US-QS-15 a sheet whose content is longer than half the window has two heights", () => {
    // The sheet stops at half (320 px) and its content overflows by 400 px: it is 720 px long in all.
    expect(sheetKind(measure({ height: 320, overflow: 400 }), heights)).toBe("two");
  });

  it("US-QS-15 a content that is only a pixel longer than half stays at its fitting height (no flicker at the border)", () => {
    expect(sheetKind(measure({ height: 320, overflow: 1 }), heights)).toBe("fit");
  });

  it("US-QS-15 a sheet at half height whose content has become shorter than half falls back to its fitting height", () => {
    expect(sheetKind(measure({ height: 320, overflow: 0 }), heights)).toBe("fit");
  });

  it("US-QS-15 a sheet at full height stays a sheet with two heights while it shows no overflow", () => {
    expect(sheetKind(measure({ height: 640, overflow: 0 }), heights)).toBe("two");
  });

  it("US-QS-15 at 200 % text, when title and actions do not fit within half height, the sheet opens at full height", () => {
    // 200 % text: the root font size is 32 px, the header is 300 px high: 300 + 4 rem (128 px) leaves nothing of the 320 px.
    expect(sheetKind(measure({ height: 320, overflow: 400, chrome: 300, rem: 32 }), heights)).toBe(
      "full",
    );
  });

  it("US-QS-15 at 200 % text a sheet whose whole content still fits within half stays at its fitting height", () => {
    expect(sheetKind(measure({ height: 310, chrome: 300, rem: 32 }), heights)).toBe("fit");
  });

  it("US-QS-15 · issue 2424 a sheet that asks for half height at least has two heights although its content fits within half", () => {
    expect(sheetKind(measure({ height: 250 }), heights, true)).toBe("two");
    expect(sheetKind(measure({ height: 320, overflow: 0 }), heights, true)).toBe("two");
  });

  it("US-QS-15 · issue 2424 a sheet that asks for half height at least still opens at full height at 200 % text, when title and actions do not fit within half", () => {
    expect(sheetKind(measure({ height: 310, chrome: 300, rem: 32 }), heights, true)).toBe("full");
  });

  it("US-QS-15 · issue 2424 asking for half height at least changes nothing for a content that is longer than half", () => {
    expect(sheetKind(measure({ height: 320, overflow: 400 }), heights, true)).toBe("two");
  });

  it("US-QS-15 the middle between half and full goes to full height", () => {
    expect(nearestDetent(480, heights)).toBe("full");
  });

  it("US-QS-15 a drag between half and full changes the height of the sheet only", () => {
    expect(dragFrame(450, { lowest: 320, highest: 640 })).toEqual({ height: 450, offset: 0 });
  });

  it("US-QS-15 a drag above full height stops at full height", () => {
    expect(dragFrame(900, { lowest: 320, highest: 640 })).toEqual({ height: 640, offset: 0 });
  });

  it("US-QS-15 a drag below half height keeps half height and moves the sheet down", () => {
    expect(dragFrame(250, { lowest: 320, highest: 640 })).toEqual({ height: 320, offset: 70 });
  });

  it("US-QS-15 dragging a sheet at half height far down past half closes it", () => {
    const frame = dragFrame(180, { lowest: 320, highest: 640 });
    expect(releaseOf(frame, heights, "two", 320)).toEqual({ close: true, detent: null });
  });

  it("US-QS-15 a drag that ends only a little below half height brings the sheet back to half height", () => {
    const frame = dragFrame(300, { lowest: 320, highest: 640 });
    expect(releaseOf(frame, heights, "two", 320)).toEqual({ close: false, detent: "half" });
  });

  it("US-QS-15 a release between the heights names the nearer height", () => {
    const frame = dragFrame(560, { lowest: 320, highest: 640 });
    expect(releaseOf(frame, heights, "two", 320)).toEqual({ close: false, detent: "full" });
  });

  it("US-QS-15 a sheet with one height (fit or full) has no height to snap to; a long drag down closes it", () => {
    const far = dragFrame(100, { lowest: 300, highest: 300 });
    expect(releaseOf(far, heights, "fit", 300)).toEqual({ close: true, detent: null });
    const near = dragFrame(280, { lowest: 300, highest: 300 });
    expect(releaseOf(near, heights, "fit", 300)).toEqual({ close: false, detent: null });
  });
});

describe("US-QS-15 · announcement of a change of height", () => {
  it("US-QS-15 names the sheet title and the new height ('Details, Vollbild')", () => {
    expect(announcement("Details", "full")).toBe("Details, Vollbild");
    expect(announcement("Details", "half")).toBe("Details, Halbe Höhe");
  });
});
