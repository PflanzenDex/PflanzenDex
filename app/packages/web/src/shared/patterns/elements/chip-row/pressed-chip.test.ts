import { describe, expect, it } from "vitest";
import { PRESSED_CHIP } from "./pressed-chip";

describe("US-QS-15 SG-TYPE-01 SG-COLOR-05 the pressed look of a toggle chip (issue 2612)", () => {
  const classes = PRESSED_CHIP.split(/\s+/);

  it("US-QS-15 SG-TYPE-01 the label keeps the weight 600; 700 is for the page title only", () => {
    expect(classes).toContain("font-semibold");
    for (const heavy of ["font-bold", "font-extrabold", "font-black"]) {
      expect(classes).not.toContain(heavy);
    }
  });

  it("US-QS-15 SG-COLOR-05 in forced colors the button's 1 px border would replace the thicker one, so the pressed chip asks for 2 px there too (WCAG 1.4.11)", () => {
    expect(classes).toContain("forced-colors:border-2");
  });

  it("US-QS-15 SG-COLOR-05 the state is more than colour: a thicker border in the primary colour (the check mark is the second cue)", () => {
    expect(classes).toContain("border-2");
    expect(classes).toContain("border-primary");
  });
});
