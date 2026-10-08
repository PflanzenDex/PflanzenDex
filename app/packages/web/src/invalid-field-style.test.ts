import { describe, expect, it } from "vitest";
import { fieldClasses } from "./components/ui/fields/input/input";

// US-ACC-02: a refused field gets a visible marker, but marking it must not move the layout (issue 297). The real
// height check runs in the browser (test log); here the classes are pinned: colour and inset ring, no border width.
describe("US-ACC-02 marker of a refused field", () => {
  it("US-ACC-02 draws the marker visibly (colour and inset ring) without changing the box size", () => {
    expect(fieldClasses).toContain("aria-invalid:border-destructive");
    expect(fieldClasses).toContain("aria-invalid:inset-ring-1");
    expect(fieldClasses).toContain("aria-invalid:inset-ring-destructive");
    expect(fieldClasses).not.toMatch(/aria-invalid:border-\d/);
    expect(fieldClasses).not.toMatch(/aria-invalid:(p|m)[xytblr]?-/);
  });
});
