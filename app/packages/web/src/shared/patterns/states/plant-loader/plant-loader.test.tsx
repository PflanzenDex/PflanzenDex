// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlantLoader } from "./plant-loader";

afterEach(cleanup);

describe("PlantLoader (US-QS-07, DS-56)", () => {
  it("US-QS-07 · DS-56 is announced once as a status with the German loading text", () => {
    render(<PlantLoader />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Lädt…");
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-07 · DS-56 the loading text comes from the label prop", () => {
    render(<PlantLoader label="Pflanzen werden geladen" />);
    expect(screen.getByRole("status").textContent).toBe("Pflanzen werden geladen");
  });

  it("US-QS-07 · DS-56 decorative has no status and no text, for places that carry one already", () => {
    const { container } = render(<PlantLoader decorative data-testid="p" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("p").getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("");
  });

  it("US-QS-07 · DS-56 the animation stops under reduced motion and shows a static pose", () => {
    const { container } = render(<PlantLoader />);
    const animated = container.querySelectorAll("g");
    expect(animated).toHaveLength(2);
    for (const g of animated)
      expect(g.getAttribute("class")).toContain("motion-reduce:animate-none");
  });

  it("US-QS-07 · DS-56 the colour comes from tokens and no number is shown (P-08)", () => {
    const { container } = render(<PlantLoader />);
    expect(container.querySelector("span")?.className).toContain("text-primary");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it.each([
    ["sm", "size-6"],
    ["md", "size-10"],
    ["lg", "size-16"],
  ] as const)("US-QS-07 · DS-34 size %s sets %s, md is the default", (size, cls) => {
    render(<PlantLoader size={size} />);
    expect(screen.getByRole("status").className).toContain(cls);
    cleanup();
    render(<PlantLoader />);
    expect(screen.getByRole("status").className).toContain("size-10");
  });

  it("US-QS-07 · DS-36 forwards ref, native props and puts caller classes last", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<PlantLoader ref={ref} className="mx-auto" data-testid="p" />);
    expect(screen.getByTestId("p")).toBe(ref.current);
    expect(ref.current?.className.endsWith("mx-auto")).toBe(true);
  });
});
