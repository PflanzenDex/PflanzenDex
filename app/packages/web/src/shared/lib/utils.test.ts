import { describe, expect, it, vi } from "vitest";
import { cn, mergeRefs } from "./utils";

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

describe("mergeRefs (US-QS-32 · SG-FORM-03)", () => {
  it("US-QS-32 · SG-FORM-03 mergeRefs hands one element to a callback and to a ref object, and skips an empty ref", () => {
    const node = {} as HTMLDivElement;
    const callback = vi.fn();
    const object = { current: null as HTMLDivElement | null };
    mergeRefs<HTMLDivElement>(callback, undefined, object)(node);
    expect(callback).toHaveBeenCalledWith(node);
    expect(object.current).toBe(node);
    mergeRefs<HTMLDivElement>(callback, object)(null);
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(object.current).toBeNull();
  });
});
