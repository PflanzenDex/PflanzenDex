import { describe, expect, it } from "vitest";
import { PRESSED_CHIP } from "./pressed-chip";

describe("US-QS-15 SG-TYPE-01 SG-COLOR-05 the pressed look of a toggle chip (issues 2612, owner decision d-178)", () => {
  const classes = PRESSED_CHIP.split(/\s+/);

  it("US-QS-15 SG-TYPE-01 the label keeps the weight 600; 700 is for the page title only", () => {
    expect(classes).toContain("font-semibold");
    for (const heavy of ["font-bold", "font-extrabold", "font-black"]) {
      expect(classes).not.toContain(heavy);
    }
  });

  it("US-QS-15 d-178 the pressed chip is outlined: the card fill, a 2 px primary border and primary text, so the check mark is primary too", () => {
    expect(classes).toContain("bg-card");
    expect(classes).toContain("border-2");
    expect(classes).toContain("border-primary");
    expect(classes).toContain("text-primary");
  });

  it("US-QS-15 d-178 SG-BTN-02 SG-COLOR-01 the pressed chip has no tinted or filled fill, so it cannot be taken for the tinted buttons Filter and Art vorschlagen", () => {
    for (const fill of [
      "bg-accent",
      "bg-primary",
      "text-accent-foreground",
      "text-primary-foreground",
    ]) {
      expect(classes).not.toContain(fill);
    }
  });

  it("US-QS-15 SG-COLOR-05 in forced colors the button's 1 px border would replace the thicker one, so the pressed chip asks for 2 px there too (WCAG 1.4.11)", () => {
    expect(classes).toContain("forced-colors:border-2");
  });
});
