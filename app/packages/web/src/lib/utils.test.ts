import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn (US-QS-07, DS-57)", () => {
  it("US-QS-07 · DS-31 cn merges class names with caller classes last", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("US-QS-07 · DS-31 cn keeps unrelated classes and drops falsy values", () => {
    expect(cn("flex gap-2", false, undefined, null, "text-sm")).toBe("flex gap-2 text-sm");
  });

  it("US-QS-07 · DS-31 cn lets a caller class override a conflicting base class", () => {
    expect(cn("px-2 text-sm", "px-6")).toBe("text-sm px-6");
  });
});
