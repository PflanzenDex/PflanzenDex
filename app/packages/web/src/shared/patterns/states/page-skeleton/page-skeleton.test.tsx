// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageSkeleton } from "./page-skeleton";

afterEach(cleanup);

describe("PageSkeleton (US-QS-07, DS-55, DS-56)", () => {
  it("US-QS-07 · DS-55 is one status region with a loading text and decorative blocks", async () => {
    const { container } = render(<PageSkeleton />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it("US-QS-07 · DS-55 the loading text can be replaced and the page never scrolls sideways", async () => {
    render(<PageSkeleton label="Pflanzen werden geladen" />);
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Pflanzen werden geladen");
    expect(status.className).toContain("min-w-0");
  });
});

describe("PageSkeleton with the destination heading (US-QS-14, DS-55, issue 1097)", () => {
  it("US-QS-14 · issue 1097 shows the destination's name as the one h1 above one loading status", async () => {
    render(<PageSkeleton heading="Sammlung" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Sammlung");
    expect(heading.hasAttribute("data-route-fallback")).toBe(true);
    expect(heading.className).toContain("text-2xl");
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
  });

  it("US-QS-14 · issue 1697 the name stands at once and the blocks wait for the delay", async () => {
    render(<PageSkeleton heading="Heute" />);
    expect(screen.getByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("US-QS-07 without a heading it shows no h1", async () => {
    render(<PageSkeleton />);
    expect(screen.queryByRole("heading")).toBeNull();
    await screen.findByRole("status");
  });
});

describe("PageSkeleton sprout (US-QS-07, DS-56)", () => {
  it("US-QS-07 · DS-56 shows the sprout without a second status", async () => {
    const { container } = render(<PageSkeleton />);
    await screen.findByRole("status");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("PageSkeleton delay (US-QS-14, DS-57, issue 1697)", () => {
  it("US-QS-14 · issue 1697 a fast load shows no status before the delay has passed", () => {
    render(<PageSkeleton />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
