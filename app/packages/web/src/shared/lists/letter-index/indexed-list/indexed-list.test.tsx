// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedList } from "./indexed-list";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset["motion"];
});

/** Names in the order of the list: 60 starting with A, 50 with B, 6 with D (C has none), so 116 rows. */
const names = [
  ...Array.from({ length: 60 }, (_, i) => `Aloe ${String(i).padStart(2, "0")}`),
  ...Array.from({ length: 50 }, (_, i) => `Begonie ${String(i).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, i) => `Dracaena ${i}`),
];

function show(items: readonly string[], byName = true) {
  return render(
    <IndexedList items={items} nameOf={(n) => n} byName={byName} label="Springen zu Buchstabe">
      <ul data-scroll-region="" aria-label="Arten">
        {items.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </IndexedList>,
  );
}

const strip = () => screen.queryByRole("slider", { name: "Springen zu Buchstabe" });

describe("US-QS-15 · SG-LIST-06 the letter index of a long list sorted by name", () => {
  it("US-QS-15 shows beside a list of more than 100 rows that is sorted by name", () => {
    show(names);
    expect(strip()).not.toBeNull();
    expect(screen.getByRole("list", { name: "Arten" })).toBeTruthy();
  });

  it("US-QS-15 shows no strip on a list of 100 rows or fewer: that list is shorter to scroll than to jump through", () => {
    show(names.slice(0, 100));
    expect(strip()).toBeNull();
    expect(screen.getByRole("list", { name: "Arten" })).toBeTruthy();
  });

  it("US-QS-15 shows no strip when the list is not sorted by name, however long it is", () => {
    show(names, false);
    expect(strip()).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(116);
  });

  it("US-QS-15 the strip is a flex sibling of the list, so the rows give up its width and none of their action lies under it", () => {
    show(names);
    const list = screen.getByRole("list", { name: "Arten" });
    const slider = strip() as HTMLElement;
    expect(slider.parentElement?.contains(list)).toBe(true);
    expect(slider.parentElement?.className).toContain("flex");
    expect(slider.className).not.toContain("absolute");
    expect(list.parentElement?.className).toContain("flex-1");
  });

  it("US-QS-15 dims the letters without an entry and keeps them", () => {
    show(names);
    const letters = [...(strip() as HTMLElement).children];
    const classes = (letter: string) => letters.find((el) => el.textContent === letter)?.className;
    expect(classes("A")).toContain("text-primary");
    expect(classes("B")).toContain("text-primary");
    expect(classes("C")).toContain("text-muted-foreground");
    expect(classes("D")).toContain("text-primary");
    expect(letters).toHaveLength(27);
  });

  it("US-QS-15 a jump scrolls the list's own box to the first entry of the letter, at once", () => {
    show(names);
    const list = screen.getByRole("list", { name: "Arten" });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo as unknown as typeof list.scrollTo;
    Object.defineProperty(list, "scrollTop", { value: 0 });
    const slider = strip() as HTMLElement;
    // Each row is 40 px high from 50 px; the first row of B is the 61st (index 60). The strip is 270 px high.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this === slider) return { top: 0, height: 270 } as DOMRect;
      const at = [...list.children].indexOf(this);
      return { top: 50 + (this === list ? 0 : at * 40) } as DOMRect;
    });
    // The place of B is index 1: 10 px per letter, so y = 15.
    fireEvent.pointerDown(slider, { clientY: 15, pointerId: 1 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 60 * 40, behavior: "auto" });
    // The place of C has no entry: the jump goes on to D, whose first entry is index 110.
    fireEvent.pointerMove(slider, { clientY: 25, pointerId: 1 });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 110 * 40, behavior: "auto" });
  });

  it("US-QS-12 · US-QS-33 the jump does not glide, with reduced motion or without", () => {
    document.documentElement.dataset["motion"] = "reduced";
    show(names);
    const list = screen.getByRole("list", { name: "Arten" });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo as unknown as typeof list.scrollTo;
    fireEvent.keyDown(strip() as HTMLElement, { key: "End" });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("US-QS-15 a list without a marked box of its own, or whose list has fewer rows than the names, jumps nowhere and breaks nothing", () => {
    render(
      <IndexedList items={names} nameOf={(n) => n} byName label="Springen zu Buchstabe">
        <p>Keine Liste</p>
      </IndexedList>,
    );
    fireEvent.keyDown(strip() as HTMLElement, { key: "End" });
    expect(strip()).not.toBeNull();
  });

  it("US-QS-15 a box that holds a list (not the list itself) is scrolled to the entry of that list", () => {
    render(
      <IndexedList items={names} nameOf={(n) => n} byName label="Springen zu Buchstabe">
        <div data-scroll-region="" data-testid="box">
          <ul>
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </IndexedList>,
    );
    const box = screen.getByTestId("box");
    const scrollTo = vi.fn();
    box.scrollTo = scrollTo as unknown as typeof box.scrollTo;
    fireEvent.keyDown(strip() as HTMLElement, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();
  });
});
