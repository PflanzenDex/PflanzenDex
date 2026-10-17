// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pagination, pageSlots } from "./pagination";

afterEach(cleanup);

describe("Pagination (US-QS-07, DS-34)", () => {
  it("US-QS-07 is a named nav with previous, next and the current page marked aria-current", () => {
    render(<Pagination page={3} pageCount={5} onPageChange={() => undefined} />);
    const nav = screen.getByRole("navigation", { name: "Seitennavigation" });
    expect(within(nav).getByRole("button", { name: "Vorherige Seite" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Nächste Seite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seite 3" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("button", { name: "Seite 2" }).getAttribute("aria-current")).toBeNull();
  });

  it("US-QS-07 collapses many pages to a constant 7 slots with gaps", () => {
    expect(pageSlots(1, 20)).toEqual([1, 2, 3, 4, 5, "gap-end", 20]);
    expect(pageSlots(10, 20)).toEqual([1, "gap-start", 9, 10, 11, "gap-end", 20]);
    expect(pageSlots(20, 20)).toEqual([1, "gap-start", 16, 17, 18, 19, 20]);
    expect(pageSlots(2, 4)).toEqual([1, 2, 3, 4]);
    for (let p = 1; p <= 20; p++) expect(pageSlots(p, 20)).toHaveLength(7);
  });

  it("US-QS-07 the gaps are hidden from assistive technology", () => {
    const { container } = render(
      <Pagination page={10} pageCount={20} onPageChange={() => undefined} />,
    );
    const gaps = [...container.querySelectorAll("li")].filter((li) => li.textContent === "…");
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-07 previous and next are disabled at the ends", () => {
    const { rerender } = render(
      <Pagination page={1} pageCount={3} onPageChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Vorherige Seite" }).hasAttribute("disabled")).toBe(
      true,
    );
    rerender(<Pagination page={3} pageCount={3} onPageChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Nächste Seite" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("US-QS-07 the keyboard operates it: Tab reaches a page, Enter selects it", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={4} onPageChange={onPageChange} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Vorherige Seite" }));
    await user.keyboard("{Enter}");
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Nächste Seite" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    screen.getByRole("button", { name: "Seite 4" }).focus();
    await user.keyboard(" ");
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });

  it("US-QS-07 every control is a 44 px target and the phone shows Seite n von m", () => {
    const { container } = render(
      <Pagination page={2} pageCount={9} onPageChange={() => undefined} />,
    );
    for (const button of screen.getAllByRole("button"))
      expect(button.className).toMatch(/min-h-\[44px\]/);
    expect(container.textContent).toContain("Seite 2 von 9");
  });

  it("US-QS-07 renders nothing without pages", () => {
    const { container } = render(
      <Pagination page={1} pageCount={0} onPageChange={() => undefined} />,
    );
    expect(container.textContent).toBe("");
  });
});
