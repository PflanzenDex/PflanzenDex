import { describe, expect, it } from "vitest";
import { fitPageSize, pageAfterResize } from "./use-page-fit";

describe("US-QS-19 page size fills the free height of the region", () => {
  it("US-QS-19 takes the whole rows that fit: n rows need n × row + (n − 1) × gap", () => {
    // Five rows of 100 px with an 8 px gap need 532 px; four rows need 424 px.
    expect(fitPageSize({ height: 532, rowHeight: 100, gap: 8, columns: 1 })).toBe(5);
    expect(fitPageSize({ height: 531, rowHeight: 100, gap: 8, columns: 1 })).toBe(4);
  });

  it("US-QS-19 multiplies the rows by the columns of a grid", () => {
    expect(fitPageSize({ height: 532, rowHeight: 100, gap: 8, columns: 2 })).toBe(10);
  });

  it("US-QS-19 without a gap a row needs only its own height", () => {
    expect(fitPageSize({ height: 300, rowHeight: 100, gap: 0, columns: 1 })).toBe(3);
  });

  it("US-QS-19 a taller row fits fewer rows", () => {
    expect(fitPageSize({ height: 532, rowHeight: 120, gap: 8, columns: 1 })).toBe(4);
  });

  it("US-QS-19 shows at least one row, even when the region is shorter than a row", () => {
    expect(fitPageSize({ height: 40, rowHeight: 100, gap: 8, columns: 2 })).toBe(2);
  });

  it("US-QS-19 honours a larger minimum of rows", () => {
    expect(fitPageSize({ height: 40, rowHeight: 100, gap: 8, columns: 1, minRows: 3 })).toBe(3);
  });

  it("US-QS-19 without a layout (no height or no row) there is no size, and the caller keeps its starting value", () => {
    expect(fitPageSize({ height: 0, rowHeight: 100, gap: 8, columns: 1 })).toBeNull();
    expect(fitPageSize({ height: 600, rowHeight: 0, gap: 8, columns: 1 })).toBeNull();
  });

  it("US-QS-19 a changed page size keeps the first entry of the page before on screen", () => {
    // Page 2 of 3-entry pages starts with entry 4 (index 3); at 5 entries per page that entry is on page 1.
    expect(pageAfterResize({ before: 3, measured: 5, raw: 2, count: 7, page: 2 })).toBe(1);
  });

  it("US-QS-19 a changed page size never leaves the address past the end", () => {
    // Page 3 of 3-entry pages starts with entry 7 (index 6); at 6 entries per page it is on page 2 of 2.
    expect(pageAfterResize({ before: 3, measured: 6, raw: 3, count: 7, page: 3 })).toBe(2);
  });

  it("US-QS-19 without a change of the size the address keeps its nearest valid page", () => {
    expect(pageAfterResize({ before: null, measured: 5, raw: 9, count: 7, page: 2 })).toBe(2);
    expect(pageAfterResize({ before: 3, measured: 3, raw: 2, count: 7, page: 2 })).toBe(2);
  });
});
