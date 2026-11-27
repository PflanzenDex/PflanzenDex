// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Controls } from "./pokedex-controls";

afterEach(cleanup);

const classesOf = (el: Element | null | undefined) => (el?.className ?? "").split(" ");

describe("US-QS-15 the search row of Sammlung > Arten at a larger text size (issue 2644)", () => {
  it("US-QS-15 the row wraps, the field keeps a 10 rem basis and the button 'Filter' keeps its size, as in the Katalog search", () => {
    render(
      <MemoryRouter>
        <Controls query="" searchRef={createRef<HTMLInputElement>()} onQuery={vi.fn()} />
      </MemoryRouter>,
    );
    const searchbox = screen.getByRole("searchbox", { name: /Suche/ });
    const filter = screen.getByRole("button", { name: "Filter" });
    // The field's wrapper is the flex item that grows from 10 rem; the row wraps when that and the button do not fit,
    // so at 200 % text the button goes under the field instead of squeezing the placeholder to a letter.
    const field = searchbox.closest("div.min-w-0");
    const row = field?.parentElement ?? null;
    expect(classesOf(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    expect(classesOf(field)).toEqual(expect.arrayContaining(["min-w-0", "grow", "basis-40"]));
    expect(row?.contains(filter)).toBe(true);
    expect(classesOf(filter)).toContain("shrink-0");
  });
});
