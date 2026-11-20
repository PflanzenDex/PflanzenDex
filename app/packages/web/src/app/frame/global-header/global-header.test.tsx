// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AppBarSlotProvider } from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { GlobalHeader } from "./global-header";

/** The shell's bar with a page under it: the page's header claims the bar while it is mounted. */
function Shell(props: { page?: boolean }) {
  return (
    <MemoryRouter>
      <AppBarSlotProvider>
        <GlobalHeader />
        <main>
          {props.page ? (
            <PageHeader title="Tauschbörse" back={{ label: "Zurück zu Freunde", to: "/friends" }} />
          ) : (
            <p>Inhalt</p>
          )}
        </main>
      </AppBarSlotProvider>
    </MemoryRouter>
  );
}

const brand = () => screen.queryByRole("link", { name: "PflanzenDéx, zu Heute" });

afterEach(cleanup);
beforeEach(() => setViewportWidth(360));

describe("US-QS-32 GlobalHeader: the brand waits while a page claims the top bar", () => {
  it("US-QS-32 the bar shows the brand while no page claims it (entry, sign-in, Konto, pages not yet migrated)", () => {
    render(<Shell />);
    expect(brand()?.getAttribute("href")).toBe("/today");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("US-QS-32 the bar hides the brand while a page header is in it, and carries the title instead", () => {
    render(<Shell page />);
    expect(brand()).toBeNull();
    const bar = document.querySelector("[data-app-bar-slot]") as HTMLElement;
    expect(bar.querySelector("h1")?.textContent).toBe("Tauschbörse");
  });

  it("US-QS-32 the brand comes back once the page with the header is gone", () => {
    const { rerender } = render(<Shell page />);
    expect(brand()).toBeNull();
    rerender(<Shell />);
    expect(brand()).not.toBeNull();
  });

  it("US-QS-32 from md up the header is not in the bar at all: the page keeps its header in the content", () => {
    setViewportWidth(1024);
    render(<Shell page />);
    expect(brand()).not.toBeNull();
    expect(document.querySelector("[data-app-bar-slot]")?.children).toHaveLength(0);
  });
});
