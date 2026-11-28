// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SensorPick } from "./sensor-pick";

beforeAll(() => {
  // The list is a sheet; Vaul calls pointer capture, which jsdom lacks.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

const LONG = "Gummibaum aus dem Wohnzimmer am großen Südfenster links";
const VIEW = {
  specimens: [
    { id: "p1", name: "Aloe" },
    { id: "p2", name: LONG },
    { id: "p3", name: "Alpenveilchen" },
  ],
  locations: [
    { id: "l1", name: "Fenster" },
    { id: "l2", name: "Bad" },
  ],
};

function open(over: Partial<Parameters<typeof SensorPick>[0]> = {}) {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <SensorPick
      sensorName="Feuchtesensor"
      view={VIEW}
      current=""
      open
      busy={false}
      onOpenChange={onOpenChange}
      onPick={onPick}
      returnFocusTo={createRef<HTMLElement>()}
      {...over}
    />,
  );
  return { onPick, onOpenChange };
}
const entries = () =>
  within(screen.getByRole("group", { name: "Zuordnung wählen" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("US-QS-32 · Q-108 the pick list of a sensor assignment (issue 2307)", () => {
  it("US-QS-32 the sheet is named after the sensor and starts with the search field", async () => {
    open();
    const dialog = await screen.findByRole("dialog", { name: "„Feuchtesensor“ zuordnen" });
    const search = within(dialog).getByRole("searchbox", { name: "Pflanze oder Standort suchen" });
    // The search comes first (SG-SEARCH-01), before the list.
    expect(
      search.compareDocumentPosition(
        within(dialog).getByRole("group", { name: "Zuordnung wählen" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  it("US-QS-32 'Nicht zugeordnet' is the first entry, then the sections 'Pflanzen' and 'Standorte'", async () => {
    open();
    await screen.findByRole("dialog");
    expect(entries()).toEqual([
      "Nicht zugeordnet",
      "Aloe",
      LONG,
      "Alpenveilchen",
      "Fenster",
      "Bad",
    ]);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Pflanzen", "Standorte"]));
    expect(headings.indexOf("Pflanzen")).toBeLessThan(headings.indexOf("Standorte"));
  });

  it("US-QS-32 · SG-TYPE-05 every entry shows its whole name and wraps it: no truncate, no clamp", async () => {
    open();
    await screen.findByRole("dialog");
    const long = screen.getByRole("button", { name: LONG });
    expect(long.textContent).toBe(LONG);
    for (const el of [long, ...Array.from(long.querySelectorAll("*"))])
      expect(el.className.toString()).not.toMatch(
        /truncate|text-ellipsis|line-clamp|overflow-hidden/,
      );
    expect(within(long).getByText(LONG).className).toContain("[overflow-wrap:anywhere]");
    // 44 px and more (SG-TOUCH-01).
    expect(long.className.split(" ")).toContain("min-h-11");
  });

  it("US-QS-32 the current choice is marked by a check mark and aria-current, not by colour alone", async () => {
    open({ current: "specimen:p2" });
    await screen.findByRole("dialog");
    const current = screen.getByRole("button", { name: LONG });
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(current.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(current).getByText(LONG).className).toContain("font-semibold");
    const others = within(screen.getByRole("group", { name: "Zuordnung wählen" }))
      .getAllByRole("button")
      .filter((b) => b !== current);
    for (const b of others) {
      expect(b.hasAttribute("aria-current")).toBe(false);
      expect(b.querySelector("svg")).toBeNull();
    }
  });

  it("US-QS-32 an unassigned sensor marks 'Nicht zugeordnet'", async () => {
    open({ current: "" });
    await screen.findByRole("dialog");
    expect(
      screen.getByRole("button", { name: "Nicht zugeordnet" }).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("US-QS-32 a pick hands over the choice with its name and its id", async () => {
    const { onPick } = open();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Fenster" }));
    expect(onPick).toHaveBeenCalledWith({ value: "location:l1", name: "Fenster" });
  });

  it("US-QS-32 'Nicht zugeordnet' hands over the empty choice", async () => {
    const { onPick } = open({ current: "location:l1" });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Nicht zugeordnet" }));
    expect(onPick).toHaveBeenCalledWith({ value: "", name: "Nicht zugeordnet" });
  });
});

describe("US-QS-32 · SG-SEARCH-01 · SG-SEARCH-02 the search of the pick list", () => {
  it("SG-SEARCH-01 filters from 2 characters: one character shows everything, two narrow the list", async () => {
    open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox");
    await user.type(search, "a");
    expect(entries()).toHaveLength(6);
    await user.type(search, "l");
    expect(entries()).toEqual(["Aloe", "Alpenveilchen"]);
    // A section without a hit has no label, and no entry is left to mark the first place.
    expect(screen.queryByRole("heading", { name: "Standorte" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Pflanzen" })).toBeTruthy();
  });

  it("SG-SEARCH-01 ignores case and the space around the query, and finds a place by its name", async () => {
    open();
    await screen.findByRole("dialog");
    await userEvent.setup().type(screen.getByRole("searchbox"), "  FENS ");
    expect(entries()).toEqual([LONG, "Fenster"]);
  });

  it("SG-SEARCH-01 the field has a clear control that empties it and keeps the focus in the field", async () => {
    open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox");
    await user.type(search, "alo");
    await user.click(screen.getByRole("button", { name: "Suche leeren" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(entries()).toHaveLength(6);
    expect(document.activeElement).toBe(search);
  });

  it("SG-SEARCH-02 a search without a hit names the query and offers the reset", async () => {
    open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox");
    await user.type(search, "xyz");
    expect(screen.getByRole("status").textContent).toBe("Nichts für „xyz“ gefunden.");
    expect(screen.queryByRole("group", { name: "Zuordnung wählen" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Suche zurücksetzen" })).toBeNull();
    expect(entries()).toHaveLength(6);
    expect(document.activeElement).toBe(search);
  });

  it("SG-SEARCH-02 'Nicht zugeordnet' is an entry like the others: a search that does not match it hides it", async () => {
    open();
    await screen.findByRole("dialog");
    await userEvent.setup().type(screen.getByRole("searchbox"), "bad");
    expect(entries()).toEqual(["Bad"]);
  });

  it("US-QS-32 the list starts without a query each time it opens", async () => {
    const props = {
      sensorName: "Feuchtesensor",
      view: VIEW,
      current: "",
      busy: false,
      onOpenChange: vi.fn(),
      onPick: vi.fn(),
      returnFocusTo: createRef<HTMLElement>(),
    };
    const { rerender } = render(<SensorPick {...props} open />);
    await screen.findByRole("dialog");
    await userEvent.setup().type(screen.getByRole("searchbox"), "alo");
    expect(entries()).toEqual(["Aloe"]);
    rerender(<SensorPick {...props} open={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(<SensorPick {...props} open />);
    await screen.findByRole("dialog");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(entries()).toHaveLength(6);
  });
});

describe("US-QS-32 · SG-BASE-01 the keyboard path of the pick list", () => {
  it("US-QS-32 the arrow keys walk from the search through the entries and back; Home and End jump", async () => {
    open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox");
    await waitFor(() => expect(document.activeElement).toBe(search));
    const list = within(screen.getByRole("group", { name: "Zuordnung wählen" })).getAllByRole(
      "button",
    );
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(list[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(list[1]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(list[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(list[list.length - 1]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(list[list.length - 1]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(list[0]);
    // From the first entry the arrow up leads back to the search.
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(search);
  });

  it("US-QS-32 Home and End still move the caret inside the search field", async () => {
    open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox");
    await user.type(search, "alo{Home}");
    expect(document.activeElement).toBe(search);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(search);
  });

  it("US-QS-32 Tab leaves the search for the first entry, Enter and Space pick the focused one, Esc closes", async () => {
    const { onPick, onOpenChange } = open();
    await screen.findByRole("dialog");
    const user = userEvent.setup();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));
    await user.tab();
    expect((document.activeElement as HTMLElement).textContent).toBe("Nicht zugeordnet");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledWith({ value: "specimen:p1", name: "Aloe" });
    await user.keyboard("{ArrowDown}{ }");
    expect(onPick).toHaveBeenLastCalledWith({ value: "specimen:p2", name: LONG });
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("SG-BASE-01 a busy list is aria-disabled and hands over nothing", async () => {
    const { onPick } = open({ busy: true });
    await screen.findByRole("dialog");
    const aloe = screen.getByRole("button", { name: "Aloe" });
    expect(aloe.getAttribute("aria-disabled")).toBe("true");
    expect(aloe.hasAttribute("disabled")).toBe(false);
    await userEvent.setup().click(aloe);
    expect(onPick).not.toHaveBeenCalled();
  });
});
