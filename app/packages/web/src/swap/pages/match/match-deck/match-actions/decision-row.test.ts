import { describe, expect, it } from "vitest";
import { decisionRowClass } from "./decision-row";

describe("US-QS-14 the decision row sticks in a tall window at the normal text size", () => {
  it("US-QS-14 the normal size keeps the sticky classes of the row", () => {
    const row = decisionRowClass(false);
    expect(row).toContain("tall-window:sticky");
    // The frame of the deck ends above the phone bar already: the row sticks at its bottom edge (issue 2421).
    expect(row).toContain("tall-window:bottom-0");
    expect(row).not.toContain("3.5rem");
  });
});

describe("US-QS-32 · SG-TYPE-04 at large text the decision row follows the card in the flow", () => {
  it("US-QS-32 · SG-TYPE-04 large text drops the sticky classes and keeps the room of the phone bar", () => {
    const row = decisionRowClass(true);
    expect(row).not.toContain("sticky");
    expect(row).toContain("tall-window:mb-20");
  });
});
