// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChipRow } from "./chip-row";

afterEach(cleanup);

const chips = (
  <>
    <button>Küche (3)</button>
    <button>Bad (1)</button>
  </>
);

describe("US-QS-15 · SG-LIST-06 the chip row is a marked sideways region (DS-63, owner decision 2026-11-21, issue 2417)", () => {
  it("US-QS-15 a row of chips that fit wraps, never scrolls, and carries the marker 'chips'", () => {
    render(
      <ChipRow label="Zum Standort springen" scroll={false}>
        {chips}
      </ChipRow>,
    );
    const row = screen.getByRole("group", { name: "Zum Standort springen" });
    expect(row.getAttribute("data-scroll-x")).toBe("chips");
    expect(row.className).toContain("flex-wrap");
    expect(row.className).not.toContain("overflow-x-auto");
  });

  it("US-QS-15 a row of chips that do not fit stays in one line and scrolls sideways inside itself, with the marker 'chips'", () => {
    render(
      <ChipRow label="Zum Standort springen" scroll>
        {chips}
      </ChipRow>,
    );
    const row = screen.getByRole("group", { name: "Zum Standort springen" });
    expect(row.getAttribute("data-scroll-x")).toBe("chips");
    expect(row.className).toContain("overflow-x-auto");
    // A scroll region keeps its scroll inside itself (DS-61).
    expect(row.className).toContain("overscroll-contain");
    expect(row.className).not.toContain("flex-wrap");
  });

  it("US-QS-15 · DS-37 · WCAG 2.4.7 the scrolling row keeps 4 px of room on every side, so the focus ring (2 px ring, 2 px offset) of a chip at its edge is not clipped (issue 2612)", () => {
    render(
      <ChipRow label="Zum Standort springen" scroll>
        {chips}
      </ChipRow>,
    );
    const classes = screen
      .getByRole("group", { name: "Zum Standort springen" })
      .className.split(/\s+/);
    // The padding is cancelled by the same negative margin, so the row costs no height or width.
    expect(classes).toContain("p-1");
    expect(classes).toContain("-m-1");
    expect(classes).not.toContain("pb-1");
    expect(classes).not.toContain("-mb-1");
  });

  it("US-QS-15 the chips of the scrolling row keep their width: they never shrink and never break their text", () => {
    render(
      <ChipRow label="Zum Standort springen" scroll>
        {chips}
      </ChipRow>,
    );
    const row = screen.getByRole("group", { name: "Zum Standort springen" });
    expect(row.className).toContain("[&>*]:shrink-0");
    expect(row.className).toContain("[&>*]:whitespace-nowrap");
  });

  it("US-QS-15 · WCAG 2.1.1 every chip is a button the keyboard reaches, so the row needs no tab stop of its own", () => {
    render(
      <ChipRow label="Zum Standort springen" scroll>
        {chips}
      </ChipRow>,
    );
    expect(screen.getByRole("group").hasAttribute("tabindex")).toBe(false);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
