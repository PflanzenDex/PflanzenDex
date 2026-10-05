// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./components/shared/app-shell";
import { navItems, PATHS } from "./navigation";

afterEach(cleanup);

const labels = (who: { reviewer?: boolean; operator?: boolean }) =>
  navItems(who).map((i) => i.label);

/** The shell renders the destinations twice (header row and bottom bar); the header row is the full list. */
const headerLinks = (path: string, who: { reviewer?: boolean; operator?: boolean }) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell items={navItems(who)}>
        <p>Inhalt</p>
      </AppShell>
    </MemoryRouter>,
  );
  return within(screen.getByRole("navigation", { name: "Hauptnavigation" }));
};

describe("US-BES-10 navigation", () => {
  it("US-BES-10 the review list tab is shown to operators and reviewers only", () => {
    expect(labels({})).not.toContain("Prüfliste");
    expect(labels({ reviewer: false })).not.toContain("Prüfliste");
    expect(labels({ reviewer: true })).toContain("Prüfliste");
    const nav = headerLinks("/review", { reviewer: true });
    expect(nav.getByRole("link", { name: "Prüfliste" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("US-ACC-05 navigation", () => {
  it("US-ACC-05 the operator tab is shown to the operator only, not to reviewers", () => {
    expect(labels({ reviewer: true })).not.toContain("Betreiber");
    expect(labels({ operator: true })).toContain("Betreiber");
    const nav = headerLinks("/operator", { operator: true });
    expect(nav.getByRole("link", { name: "Betreiber" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("US-QS-07 · DS-25 navigation items", () => {
  it("US-QS-07 · DS-25 every destination links to the address of its view", () => {
    const items = navItems({ reviewer: true, operator: true });
    expect(items.map((i) => i.href)).toEqual(Object.values(PATHS));
  });

  it("US-QS-07 · DS-25 the bottom bar shows at most 5 destinations, the rest sit in the drawer", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({})}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const bar = within(screen.getByRole("navigation", { name: "Navigation unten" }));
    expect(bar.getAllByRole("link").length + bar.getAllByRole("button").length).toBeLessThanOrEqual(
      5,
    );
    expect(bar.getByRole("button", { name: "Mehr" })).toBeTruthy();
  });
});
