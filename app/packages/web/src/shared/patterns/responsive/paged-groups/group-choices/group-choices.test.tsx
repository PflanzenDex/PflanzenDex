// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupChoices, type GroupChoice } from "./group-choices";

/** The widths the layout reports: the row and the chips as one line, in px (jsdom has no layout). */
let widths = { row: 300, needed: 280 };
const observers: ResizeObserverCallback[] = [];

class FakeResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.splice(observers.indexOf(this.callback), 1);
  }
}

beforeEach(() => {
  widths = { row: 300, needed: 280 };
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = this.hasAttribute("data-group-row")
      ? widths.row
      : this.hasAttribute("data-group-measure")
        ? widths.needed
        : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A resize of the window or a text size: the layout reports new widths and the observers run. */
function resize(next: Partial<typeof widths>) {
  widths = { ...widths, ...next };
  act(() => {
    for (const callback of [...observers]) callback([], {} as ResizeObserver);
  });
}

/** `n` choices with the counts 1, 2, 3 …, named "Gruppe 1" …, the keys the same. */
const choicesOf = (n: number): GroupChoice[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `g${i + 1}`,
    label: `Gruppe ${i + 1}`,
    count: i + 1,
  }));

/** Shows the address next to the row, so a test can read `part=` and `page=`. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

function show(choices: GroupChoice[], at = "/collection?view=plants") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <GroupChoices label="Standorte" choices={choices} />
      <Address />
    </MemoryRouter>,
  );
}

const address = () => screen.getByTestId("address").textContent ?? "";

describe("US-QS-19 · US-QS-15 group choices: a row of chips or a selection field (issue 1281)", () => {
  it("US-QS-19 chips that fit one line show as a row of choices, without a scroll", () => {
    show(choicesOf(3));
    const row = screen.getByRole("group", { name: "Standorte" });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(row.hasAttribute("data-scroll-x")).toBe(false);
    expect(row.className).not.toContain("overflow-x-auto");
    expect(row.className).not.toContain("flex-wrap");
  });

  it("US-QS-19 chips that do not fit one line show as one selection field with the names and counts", () => {
    widths = { row: 300, needed: 320 };
    show(choicesOf(3));
    const select = screen.getByRole("combobox", { name: "Standorte" });
    expect(screen.queryByRole("group", { name: "Standorte" })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Gruppe 1 (1)",
      "Gruppe 2 (2)",
      "Gruppe 3 (3)",
    ]);
  });

  it("US-QS-15 · US-QS-19 a resize switches the form both ways, without a flash of the other one", () => {
    show(choicesOf(3));
    expect(screen.getByRole("group", { name: "Standorte" })).toBeTruthy();
    resize({ row: 200 });
    expect(screen.getByRole("combobox", { name: "Standorte" })).toBeTruthy();
    resize({ row: 400 });
    expect(screen.getByRole("group", { name: "Standorte" })).toBeTruthy();
  });

  it("US-QS-19 choosing a chip never flips the row to the selection field, though the chosen chip is wider", async () => {
    show(choicesOf(3), "/collection?view=plants&part=g1");
    const measured = document.querySelectorAll("[data-group-measure] button");
    // Every chip is measured in its widest form (the check mark on each one), so no choice changes the measure.
    expect(Array.from(measured).every((b) => b.textContent?.includes("✓"))).toBe(true);
    expect(measured).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 3/ }));
    expect(screen.getByRole("group", { name: "Standorte" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: /Gruppe 3/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("US-QS-19 choosing in the selection field never flips it back to chips", async () => {
    widths = { row: 300, needed: 320 };
    show(choicesOf(3), "/collection?view=plants&part=g1");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Standorte" }), "g2");
    expect(screen.getByRole("combobox", { name: "Standorte" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Standorte" })).toBeNull();
  });

  it("US-QS-19 the selection field shows the group chosen in the address", () => {
    widths = { row: 300, needed: 320 };
    show(choicesOf(3), "/collection?view=plants&part=g2");
    expect((screen.getByRole("combobox", { name: "Standorte" }) as HTMLSelectElement).value).toBe(
      "g2",
    );
  });

  it("US-QS-19 choosing in the selection field writes part= and removes page", async () => {
    widths = { row: 300, needed: 320 };
    show(choicesOf(3), "/collection?view=plants&part=g1&page=3");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Standorte" }), "g3");
    expect(address()).toContain("part=g3");
    expect(address()).not.toContain("page=");
  });

  it("US-QS-19 choosing a chip writes part= and removes page", async () => {
    show(choicesOf(2), "/collection?view=plants&page=2");
    await userEvent.click(screen.getByRole("button", { name: /Gruppe 2/ }));
    expect(address()).toContain("part=g2");
    expect(address()).not.toContain("page=");
  });

  it("US-QS-15 · US-QS-19 the keyboard focus stays on the selection field after choosing", async () => {
    widths = { row: 300, needed: 320 };
    show(choicesOf(3));
    const select = screen.getByRole("combobox", { name: "Standorte" });
    select.focus();
    await userEvent.selectOptions(select, "g3");
    expect(document.activeElement).toBe(select);
  });

  it("US-QS-19 the measuring box is hidden from assistive technology and cannot take the focus", () => {
    show(choicesOf(3));
    const box = document.querySelector("[data-group-measure]")?.parentElement;
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(box?.hasAttribute("inert")).toBe(true);
    for (const b of Array.from(document.querySelectorAll("[data-group-measure] button"))) {
      expect(b.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("US-QS-19 without a measurable layout the chips show (the default)", () => {
    vi.restoreAllMocks();
    render(
      <MemoryRouter>
        <GroupChoices label="Standorte" choices={choicesOf(7)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("group", { name: "Standorte" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
