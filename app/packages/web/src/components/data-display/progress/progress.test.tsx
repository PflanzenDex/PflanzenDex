// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./progress";

afterEach(cleanup);

describe("Progress (US-QS-07, 4.1.2)", () => {
  it("US-QS-07 is a progressbar with name, value, min and max", () => {
    render(<Progress aria-label="Aufgaben erledigt" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Aufgaben erledigt" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect((bar.firstElementChild as HTMLElement).style.getPropertyValue("--progress")).toBe("40%");
  });

  it("US-QS-07 a custom max scales the fill and valueText is spoken instead of the number", () => {
    render(<Progress aria-label="Behandlung" value={3} max={5} valueText="3 von 5 erledigt" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(bar.getAttribute("aria-valuetext")).toBe("3 von 5 erledigt");
    expect((bar.firstElementChild as HTMLElement).style.getPropertyValue("--progress")).toBe("60%");
  });

  it.each([
    [-5, "0", "0%"],
    [250, "100", "100%"],
    [Number.NaN, "0", "0%"],
  ])("US-QS-07 value %s is clamped to %s", (value, now, width) => {
    render(<Progress aria-label="x" value={value} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe(now);
    expect((bar.firstElementChild as HTMLElement).style.getPropertyValue("--progress")).toBe(width);
  });

  it("US-QS-07 the fill transition stops under reduced motion", () => {
    render(<Progress aria-label="x" value={10} />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain("motion-reduce:transition-none");
  });

  it("US-QS-07 · DS-36 forwards ref and puts caller classes last", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Progress ref={ref} aria-label="x" value={1} className="mt-2" />);
    expect(ref.current?.className.endsWith("mt-2")).toBe(true);
  });
});
