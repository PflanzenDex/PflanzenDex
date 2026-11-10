// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DiscoverModeSkeleton, DiscoverRouteSkeleton } from "./discover-area.skeleton";

afterEach(cleanup);

describe("DiscoverRouteSkeleton (US-QS-14, DS-52, DS-57, issue 1697)", () => {
  it("US-QS-14 issue 1697 · the title 'Entdecken' stands at once as the one h1, the blocks wait for the delay", async () => {
    render(<DiscoverRouteSkeleton view="suggestions" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Entdecken");
    expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("US-QS-14 issue 1697 · the suggestions show the card's shape, the catalog the search's shape, both with one status", async () => {
    const { container, rerender } = render(<DiscoverRouteSkeleton view="suggestions" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Vorschläge werden geladen …");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(5);
    rerender(<DiscoverRouteSkeleton view="catalog" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Katalog wird geladen …");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("US-QS-14 issue 1697 · no number is shown while it loads (P-08)", async () => {
    render(<DiscoverRouteSkeleton view="catalog" />);
    expect((await screen.findByRole("status")).textContent).not.toMatch(/\d/);
  });
});

describe("DiscoverModeSkeleton (US-QS-14, issue 1697)", () => {
  it("US-QS-14 issue 1697 · a mode's skeleton shows after the delay and never twice", async () => {
    render(<DiscoverModeSkeleton view="suggestions" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
