// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { LayerOpenRow } from "./layer-part";

afterEach(cleanup);

// A list that scrolls (`ScrollEntries` with `fit`) clips what lies outside its rows: a ring with an offset reaches
// 4 px out and loses its top and its sides (issue 2650, DS-37). jsdom has no layout, so the class check stands for it.
describe("US-QS-15 · US-QS-17 the focus ring of a row that opens a layer stays inside the row (issue 2650, WCAG 2.4.7)", () => {
  it("US-QS-15 the ring is inset and has no offset, so a scrolling list does not clip it", () => {
    render(
      <MemoryRouter>
        <LayerOpenRow id="fn-light" title="Licht" value="offen" />
      </MemoryRouter>,
    );
    const cls = screen.getByRole("button", { name: /Licht/ }).className.split(" ");
    expect(cls).toEqual(
      expect.arrayContaining([
        "focus-visible:ring-2",
        "focus-visible:ring-inset",
        "focus-visible:ring-offset-0",
      ]),
    );
    expect(cls).not.toContain("focus-visible:ring-offset-2");
  });
});
