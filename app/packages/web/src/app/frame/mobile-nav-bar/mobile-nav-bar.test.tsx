// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { NavItem } from "../../../shared/patterns/navigation/nav-item";
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

  it("US-QS-15 the icon pill of a destination stays inside its slot at a larger text size: its 3.5 rem width is capped by max-w-full (issue 1019)", () => {
    render(
      <MemoryRouter initialEntries={["/p0"]}>
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );
    const first = within(screen.getByRole("navigation", { name: "Navigation unten" })).getAllByRole(
      "link",
    )[0];
    const pill = first?.querySelector("span.rounded-full");
    expect(pill?.className).toContain("w-14");
    expect(pill?.className).toContain("max-w-full");
  });

  it("US-QS-15 a bar label never breaks inside a word: it stays on one line, and below 21.75 rem of bar width every label leaves the view and stays the name, so the bar shows icons only (issue 1107)", () => {
    render(
      <MemoryRouter initialEntries={["/p0"]}>
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Navigation unten" });
    expect(nav.className).toContain("@container");
    const bar = within(nav);
    const slots = [...bar.getAllByRole("link"), bar.getByRole("button", { name: "Mehr" })];
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      const word = [...slot.querySelectorAll("span")].find(
        (s) => s.children.length === 0 && s.textContent?.trim(),
      );
      expect(word?.className).toContain("whitespace-nowrap");
      expect(word?.className).not.toMatch(/hyphens|break-words|break-all/);
      expect(word?.parentElement?.className).toContain("@max-[21.75rem]:sr-only");
    }
    expect(bar.getAllByRole("link").map((l) => l.textContent)).toEqual(
      items.slice(0, 4).map((i) => i.label),
    );
  });
});
