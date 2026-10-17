// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton, SkeletonGroup } from "./skeleton";

afterEach(cleanup);

describe("Skeleton (US-QS-07, DS-52, DS-56)", () => {
  it("US-QS-07 · DS-56 a container has exactly one status with the loading text and aria-hidden blocks", () => {
    const { container } = render(
      <SkeletonGroup label="Lädt…">
        <Skeleton data-testid="a" />
        <Skeleton data-testid="b" />
      </SkeletonGroup>,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.textContent).toContain("Lädt…");
    expect(screen.getByTestId("a").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("b").getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(2);
  });

  it("US-QS-07 · DS-56 the loading text comes from the label prop", () => {
    render(<SkeletonGroup label="Loading">x</SkeletonGroup>);
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });

  it("US-QS-07 · DS-56 a loading state shows no number (P-08)", () => {
    render(
      <SkeletonGroup label="Lädt…">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(screen.getByRole("status").textContent).not.toMatch(/\d/);
  });

  it("US-QS-07 · DS-56 no animation runs under reduced motion", () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId("s").className).toContain("motion-reduce:animate-none");
  });

  it("US-QS-07 · DS-36 forwards ref, native props and puts caller classes last", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} data-testid="s" className="h-12" />);
    expect(screen.getByTestId("s")).toBe(ref.current);
    expect(ref.current?.className).toContain("h-12");
  });
});
