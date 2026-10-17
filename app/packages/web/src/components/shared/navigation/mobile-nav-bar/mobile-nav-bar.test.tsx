// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { NavItem } from "../nav-model/nav-item";
import { MobileNavBar } from "./mobile-nav-bar";

afterEach(cleanup);

const items: NavItem[] = Array.from({ length: 6 }, (_, i) => ({
  href: `/p${i}`,
  label: `Ziel ${i}`,
  icon: <svg aria-hidden="true" />,
}));

/** The forced-colors border classes of an element, e.g. `forced-colors:border`. */
const forcedBorder = (el: Element) =>
  [...el.classList].filter((c) => /^forced-colors:border(-|$)/.test(c) && !c.includes("["));

describe("MobileNavBar in forced colors (US-QS-14)", () => {
  it("US-QS-14 Mehr carries no box border of its own, like the links next to it", () => {
    render(
      <MemoryRouter initialEntries={["/p0"]}>
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );
    const bar = within(screen.getByRole("navigation", { name: "Navigation unten" }));
    const more = bar.getByRole("button", { name: "Mehr" });
    for (const link of bar.getAllByRole("link")) expect(forcedBorder(link)).toEqual([]);
    expect(forcedBorder(more)).toEqual(["forced-colors:border-0"]);
  });
});
