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
    expect(
      pageAfterResize({ before: 3, starting: 3, measured: 5, raw: 2, count: 7, page: 2 }),
    ).toBe(1);
  });

  it("US-QS-19 a changed page size never leaves the address past the end", () => {
    // Page 3 of 3-entry pages starts with entry 7 (index 6); at 6 entries per page it is on page 2 of 2.
    expect(
      pageAfterResize({ before: 3, starting: 3, measured: 6, raw: 3, count: 7, page: 3 }),
    ).toBe(2);
  });

  it("US-QS-19 without a change of the size the address keeps its nearest valid page", () => {
    expect(
      pageAfterResize({ before: null, starting: 5, measured: 5, raw: 9, count: 7, page: 2 }),
    ).toBe(2);
    expect(
      pageAfterResize({ before: 3, starting: 3, measured: 3, raw: 2, count: 7, page: 2 }),
    ).toBe(2);
  });

  // A direct link to a far page is read with the starting size, before any measurement (issue 1372). Page 19 of 6-entry
  // pages starts with entry 109 (index 108) of 111 plants; at 3 per page that entry is on page 37.
  it("FR-BES-23 a first measurement that shrinks the page size keeps the first entry of the address on screen", () => {
    expect(
      pageAfterResize({ before: null, starting: 6, measured: 3, raw: 19, count: 111, page: 19 }),
    ).toBe(37);
  });

  it("FR-BES-23 a first measurement that grows the page size keeps the first entry of the address on screen", () => {
    // Page 19 of 3-entry pages starts with index 54; at 6 entries per page that index is on page 10.
    expect(
      pageAfterResize({ before: null, starting: 3, measured: 6, raw: 19, count: 111, page: 19 }),
    ).toBe(10);
  });

  it("FR-BES-23 a first measurement keeps a link past the end of the list on the nearest valid page, as before", () => {
    // Page 50 is past the end at the starting size (19 pages of 6), so it keeps the last page of the measured size.
    expect(
      pageAfterResize({ before: null, starting: 6, measured: 3, raw: 50, count: 111, page: 37 }),
    ).toBe(37);
  });

  it("FR-BES-23 a first measurement equal to the starting size changes nothing", () => {
    expect(
      pageAfterResize({ before: null, starting: 6, measured: 6, raw: 19, count: 111, page: 19 }),
    ).toBe(19);
  });
});
