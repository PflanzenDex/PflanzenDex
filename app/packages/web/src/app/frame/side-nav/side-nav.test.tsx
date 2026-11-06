// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { navItems } from "../../../shared/patterns/navigation/navigation/navigation";
import { SideNav } from "./side-nav";

afterEach(cleanup);

/** Classes that let a browser break a word inside a label or shrink it below its word (US-QS-15, issue 1576). */
const WORD_BREAKING = [
  "break-words",
  "break-all",
  "break-anywhere",
  "min-w-0",
  "hyphens-auto",
  "truncate",
  "text-ellipsis",
];

const classesOf = (el: Element) => el.className.split(/\s+/);

describe("US-QS-15 side navigation with a text mark", () => {
  it("US-QS-15 the label Freunde stays whole next to the badge Noch gesperrt: no class breaks words and the row wraps (issue 1576)", () => {
    render(
      <MemoryRouter>
        <SideNav items={navItems({ locks: { friends: "Noch gesperrt" } })} />
      </MemoryRouter>,
    );
    const sidebar = within(screen.getByRole("navigation", { name: "Hauptnavigation" }));
    const rail = within(screen.getByRole("navigation", { name: "Navigation seitlich" }));

    const sidebarLink = sidebar.getByRole("link", { name: /Freunde/ });
    const sidebarLabel = within(sidebarLink).getByText("Freunde");
    expect(sidebarLink.textContent).toContain("Noch gesperrt");
    for (const name of WORD_BREAKING) expect(classesOf(sidebarLabel)).not.toContain(name);
    expect(classesOf(sidebarLabel)).toContain("whitespace-nowrap");
    // The row wraps as a whole: when label and mark do not fit one row, the mark moves to a line of its own.
    expect(classesOf(sidebarLink)).toContain("flex-wrap");

    const railLink = rail.getByRole("link", { name: /Freunde/ });
    const railLabel = within(railLink).getByText("Freunde");
    expect(railLink.textContent).toContain("Noch gesperrt");
    for (const name of WORD_BREAKING) expect(classesOf(railLabel)).not.toContain(name);
    expect(classesOf(railLabel)).toContain("whitespace-nowrap");
  });
});
