// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NowSkeleton, TodaySkeleton } from "./today-skeleton";

afterEach(cleanup);

describe("TodaySkeleton (US-QS-14, DS-52, DS-53, issue 1697)", () => {
  it("US-QS-14 issue 1697 · the title of 'Heute' stands at once as the one h1 of the page", () => {
    render(<TodaySkeleton />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Heute");
    expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(true);
  });

  it("US-QS-14 issue 1697 · the blocks show after the delay as exactly one loading status", async () => {
    render(<TodaySkeleton />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Heute wird geladen …");
  });

  it("US-QS-14 issue 1697 · the shape has the summary line, the 'Jetzt dran' card and two tiles, all decorative", async () => {
    const { container } = render(<TodaySkeleton />);
    await screen.findByRole("status");
    const blocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(blocks).toHaveLength(4);
    // The container of the page: a column that fills the free height with the page's gap (TodayPage).
    const page = container.firstElementChild;
    expect(page?.className).toContain("flex-1");
    expect(page?.className).toContain("gap-2");
    // The tiles stand in two columns, like the tiles of the overview.
    expect(container.querySelector(".grid-cols-2")?.children).toHaveLength(2);
  });

  it("US-QS-14 issue 1697 · no number is shown while it loads (P-08)", async () => {
    render(<TodaySkeleton />);
    const status = await screen.findByRole("status");
    expect(status.textContent).not.toMatch(/\d/);
  });
});

describe("NowSkeleton (US-QS-14, DS-52, issue 1697)", () => {
  it("US-QS-14 issue 1697 · the 'Jetzt dran' part has one card block and one status with its own label", async () => {
    const { container } = render(<NowSkeleton label="Heute wird geladen …" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Heute wird geladen …");
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it("US-QS-14 issue 1697 · a fast 'Jetzt dran' load shows no status", () => {
    render(<NowSkeleton label="Heute wird geladen …" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
