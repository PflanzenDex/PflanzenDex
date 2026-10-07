// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageSkeleton } from "./page-skeleton";

afterEach(cleanup);

describe("PageSkeleton (US-QS-07, DS-55, DS-56)", () => {
  it("US-QS-07 · DS-55 is one status region with a loading text and decorative blocks", () => {
    const { container } = render(<PageSkeleton />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it("US-QS-07 · DS-55 the loading text can be replaced and the page never scrolls sideways", () => {
    render(<PageSkeleton label="Pflanzen werden geladen" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Pflanzen werden geladen");
    expect(status.className).toContain("min-w-0");
  });
});

describe("PageSkeleton sprout (US-QS-07, DS-56)", () => {
  it("US-QS-07 · DS-56 shows the sprout without a second status", () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
