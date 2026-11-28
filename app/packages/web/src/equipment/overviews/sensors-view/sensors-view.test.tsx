// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SensorView } from "@pflanzendex/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Context, type Api } from "@/shared/platform/announcer/context";
import { SensorsView } from "./sensors-view";

beforeAll(() => {
  // The pick list is a sheet; Vaul calls pointer capture, which jsdom lacks.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

/** A plant name of 55 characters, the length of the one in the filled account (issue 2307, finding F-0149). */
const LONG = "Gummibaum aus dem Wohnzimmer am großen Südfenster links";

const view = (extra: Partial<SensorView["sensors"][number]> = {}): SensorView => ({
  sensors: [{ id: "s1", name: "Feuchtesensor", status: "active", target: null, ...extra }],
  specimens: [
    { id: "p1", name: "Aloe" },
    { id: "p2", name: LONG },
  ],
  locations: [{ id: "l1", name: "Fenster" }],
});
const actions = () => ({ busy: false, onTarget: vi.fn() });
const saved = () => ({ busy: false, onTarget: vi.fn(async () => true) });

/** The row is named by its visible text, "Zugeordnet zu" and the place, and then the sensor's name (WCAG 2.5.3). */
const ROW = /^Zugeordnet zu .+ Feuchtesensor$/;
const row = () => screen.getByRole("button", { name: ROW });
/** The row while a modal is open: the page behind it is hidden from the accessibility tree, the row is still there. */
const rowBehind = () => screen.getByRole("button", { name: ROW, hidden: true });
/** The line of the sensor's result, under its row. */
const line = () => document.querySelector("li > div") as HTMLElement;
const pick = async (name: string) => {
  const user = userEvent.setup();
  await user.click(row());
  await user.click(await screen.findByRole("button", { name }));
};

afterEach(cleanup);

describe("US-EQU-06 sensors and their place", () => {
  it("US-EQU-06 shows nothing without a sensor", () => {
    const { container } = render(
      <SensorsView view={{ sensors: [], specimens: [], locations: [] }} actions={actions()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("US-EQU-06 the view renders no heading named Sensoren: the sheet owns the title, so it shows once (SG-BASE-01, issue 2168)", () => {
    const { container } = render(<SensorsView view={view()} actions={actions()} />);
    expect(screen.queryByRole("heading", { name: "Sensoren" })).toBeNull();
    // The section names nothing of its own: a reference to a heading that is gone would name it by nothing.
    expect(container.querySelector("section")?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("US-EQU-06 an unassigned sensor reads 'Nicht zugeordnet' in its row and can be put at a specimen", async () => {
    const a = actions();
    render(<SensorsView view={view()} actions={a} />);
    expect(row().textContent).toContain("Nicht zugeordnet");
    await pick("Aloe");
    expect(a.onTarget).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: "p1",
      locationId: null,
    });
  });

  it("US-EQU-06 a pick at a location sends the location", async () => {
    const a = actions();
    render(<SensorsView view={view()} actions={a} />);
    await pick("Fenster");
    expect(a.onTarget).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: null,
      locationId: "l1",
    });
  });

  it("US-EQU-06 shows the current location in the row and 'Nicht zugeordnet' sends none", async () => {
    const a = actions();
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={a}
      />,
    );
    expect(row().textContent).toContain("Fenster");
    await pick("Nicht zugeordnet");
    expect(a.onTarget).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: null,
      locationId: null,
    });
  });

  it("US-QS-15 the cards take their columns from the width of the layer, not the window: a 350 px pane keeps one column (issue 1640)", () => {
    const { container } = render(<SensorsView view={view()} actions={actions()} />);
    const section = container.querySelector("section") as HTMLElement;
    const list = container.querySelector("ul") as HTMLElement;
    expect(section.className.split(" ")).toContain("@container");
    expect(list.className.split(" ")).toEqual(
      expect.arrayContaining(["@lg:grid-cols-2", "@3xl:grid-cols-3"]),
    );
    // A viewport breakpoint would split the card of a pane at 1024 px: no sm:, md:, lg: or xl: on the grid.
    expect(list.className.split(" ").filter((c) => /^(sm|md|lg|xl):/.test(c))).toEqual([]);
  });
});

describe("US-QS-32 · Q-108 the assignment is a row that opens a pick list (issue 2307)", () => {
  it("US-QS-32 the row is named by its visible text 'Zugeordnet zu' and the place, then the sensor name, and says what it opens (WCAG 2.5.3, issue 1981)", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    expect(row().tagName).toBe("BUTTON");
    expect(
      screen.getByRole("button", { name: "Zugeordnet zu Nicht zugeordnet Feuchtesensor" }),
    ).toBe(row());
    expect(row().getAttribute("aria-haspopup")).toBe("dialog");
    expect(row().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox")).toBeNull();
    // No second, longer name of its own: the name is the visible text and the sensor, not "Zuordnung von …".
    expect(screen.queryByLabelText(/Zuordnung von/)).toBeNull();
  });

  it("US-QS-32 the visible text of the row is the start of its name, so a voice command that names it hits it (WCAG 2.5.3)", () => {
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={actions()}
      />,
    );
    const ids = (row().getAttribute("aria-labelledby") ?? "").split(" ");
    const spoken = ids.map((id) => document.getElementById(id)?.textContent).join(" ");
    expect(spoken).toBe("Zugeordnet zu Fenster Feuchtesensor");
    // What axe reads as the visible text is a prefix of the name (`label-content-name-mismatch`).
    expect(row().textContent).toBe("Zugeordnet zu Fenster");
    expect(spoken.startsWith(row().textContent ?? "")).toBe(true);
  });

  it("US-QS-32 · SG-TYPE-05 a 55-character plant name shows whole in the row and wraps: nothing cuts it", () => {
    expect(LONG).toHaveLength(55);
    render(
      <SensorsView
        view={view({ target: { kind: "specimen", id: "p2", name: LONG } })}
        actions={actions()}
      />,
    );
    expect(row().textContent).toContain(LONG);
    const place = screen.getByText(LONG);
    // It wraps (a word wider than the row breaks at a syllable) and nothing in the row ends in "…".
    expect(place.className).toContain("[overflow-wrap:anywhere]");
    for (const el of [row(), ...Array.from(row().querySelectorAll("*"))])
      expect(el.className.toString()).not.toMatch(
        /truncate|text-ellipsis|line-clamp|overflow-hidden/,
      );
  });

  it("US-QS-32 the row keeps its 44 px hit area and its chevron", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    expect(row().className.split(" ")).toContain("min-h-12");
    expect(row().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-32 Enter on the row opens the pick list and moves the focus into its search; Esc closes it and the focus is back on the row", async () => {
    render(<SensorsView view={view()} actions={actions()} />);
    const user = userEvent.setup();
    row().focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "„Feuchtesensor“ zuordnen" });
    expect(rowBehind().getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("searchbox")));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row()));
  });

  it("US-QS-32 a pick closes the list, returns the focus to the row and saves through onTarget", async () => {
    const a = saved();
    render(<SensorsView view={view()} actions={a} />);
    await pick("Aloe");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row()));
    expect(a.onTarget).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 picking the place the sensor already has changes nothing: the list closes and no write is sent", async () => {
    const a = saved();
    render(
      <SensorsView
        view={view({ target: { kind: "specimen", id: "p1", name: "Aloe" } })}
        actions={a}
      />,
    );
    await pick("Aloe");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(a.onTarget).not.toHaveBeenCalled();
  });
});

describe("US-QS-32 · F-0160 · SG-FEED-01 · SG-FEED-03 the result of an assignment shows at the sensor's row, with its undo", () => {
  it("US-QS-32 · F-0160 a row reserves its line at rest: it is empty and holds one text line, so nothing moves when the result comes", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    expect(line().textContent).toBe("");
    expect(line().className.split(" ")).toContain("min-h-[1lh]");
  });

  it("US-QS-32 · SG-FEED-03 a saved assignment says 'Zugeordnet: <name> · Rückgängig' in the row and highlights it briefly (SG-MOTION-07)", async () => {
    render(<SensorsView view={view()} actions={saved()} />);
    await pick("Aloe");
    await waitFor(() => expect(line().textContent).toBe("Zugeordnet: Aloe · Rückgängig"));
    expect(line().className.split(" ")).toContain("animate-changed");
    // The undo is a button named by its visible word first (WCAG 2.5.3).
    expect(within(line()).getByRole("button", { name: /^Rückgängig/ })).toBeTruthy();
  });

  it("US-QS-32 a 55-character name shows whole in the result line", async () => {
    render(<SensorsView view={view()} actions={saved()} />);
    await pick(LONG);
    await waitFor(() => expect(line().textContent).toContain(`Zugeordnet: ${LONG}`));
  });

  it("US-QS-32 · SG-FEED-03 the undo sends the earlier place again and clears the line", async () => {
    const a = saved();
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={a}
      />,
    );
    await pick("Aloe");
    await waitFor(() => expect(line().textContent).toContain("Zugeordnet: Aloe"));
    await userEvent.setup().click(within(line()).getByRole("button", { name: /^Rückgängig/ }));
    await waitFor(() => expect(a.onTarget).toHaveBeenCalledTimes(2));
    expect(a.onTarget).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: null,
      locationId: "l1",
    });
    await waitFor(() => expect(line().textContent).toBe(""));
  });

  it("US-QS-32 · SG-FEED-03 the undo of a first assignment sends none", async () => {
    const a = saved();
    render(<SensorsView view={view()} actions={a} />);
    await pick("Fenster");
    await waitFor(() => expect(line().textContent).toBe("Zugeordnet: Fenster · Rückgängig"));
    await userEvent.setup().click(within(line()).getByRole("button", { name: /^Rückgängig/ }));
    await waitFor(() => expect(a.onTarget).toHaveBeenCalledTimes(2));
    expect(a.onTarget).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: null,
      locationId: null,
    });
  });

  it("US-QS-32 clearing an assignment says so in the row with its undo; a refused write leaves the line empty (P-10)", async () => {
    const ok = saved();
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={ok}
      />,
    );
    await pick("Nicht zugeordnet");
    await waitFor(() => expect(line().textContent).toBe("Nicht mehr zugeordnet · Rückgängig"));
    cleanup();
    const refused = { busy: false, onTarget: vi.fn(async () => false) };
    render(<SensorsView view={view()} actions={refused} />);
    await pick("Fenster");
    await waitFor(() => expect(refused.onTarget).toHaveBeenCalled());
    expect(line().textContent).toBe("");
  });

  it("US-QS-32 · SG-FEED-04 the result and the undo are announced once through the shared live region", async () => {
    const announce = vi.fn();
    const api: Api = { announce, buffer: vi.fn(), note: null };
    render(
      <Context.Provider value={api}>
        <SensorsView view={view()} actions={saved()} />
      </Context.Provider>,
    );
    await pick("Aloe");
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith("Zuordnung von „Feuchtesensor“ gesichert."),
    );
    await userEvent.setup().click(within(line()).getByRole("button", { name: /^Rückgängig/ }));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith("Zuordnung von „Feuchtesensor“ zurückgesetzt."),
    );
    expect(announce).toHaveBeenCalledTimes(2);
  });
});

describe("US-QS-32 · SG-BASE-01 the row stays focusable while an assignment saves (issue 2463, F-0094)", () => {
  it("SG-BASE-01 while the write runs the row is aria-disabled, not disabled, so the focus does not fall to the sheet", () => {
    render(<SensorsView view={view()} actions={{ busy: true, onTarget: vi.fn() }} />);
    expect(row().getAttribute("aria-disabled")).toBe("true");
    expect(row().hasAttribute("disabled")).toBe(false);
    expect(row().className.split(" ")).toContain("aria-disabled:opacity-50");
  });

  it("SG-BASE-01 a tap on the row while the write runs opens nothing and the focus stays on it", async () => {
    render(<SensorsView view={view()} actions={{ busy: true, onTarget: vi.fn() }} />);
    row().focus();
    await userEvent.setup().click(row());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(row());
  });

  it("SG-BASE-01 a pick made while a write runs is ignored: the list stays open and nothing is sent", async () => {
    const onTarget = vi.fn(async () => true);
    const { rerender } = render(<SensorsView view={view()} actions={{ busy: false, onTarget }} />);
    const user = userEvent.setup();
    await user.click(row());
    const aloe = await screen.findByRole("button", { name: "Aloe" });
    rerender(<SensorsView view={view()} actions={{ busy: true, onTarget }} />);
    expect(aloe.getAttribute("aria-disabled")).toBe("true");
    expect(aloe.hasAttribute("disabled")).toBe(false);
    await user.click(aloe);
    expect(onTarget).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("US-QS-32 · SG-BASE-01 the focus is on the row after a pick, and the undo that follows is the next stop of the keyboard", async () => {
    render(<SensorsView view={view()} actions={saved()} />);
    await pick("Aloe");
    await waitFor(() => expect(document.activeElement).toBe(row()));
    const undo = await within(line()).findByRole("button", { name: /^Rückgängig/ });
    // The undo never takes the focus from the row (keepFocus, issue 2536): Tab reaches it.
    expect(document.activeElement).toBe(row());
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(undo);
  });

  it("US-QS-32 · SG-BASE-01 while the undo writes it is aria-disabled and a second tap sends nothing", async () => {
    const onTarget = vi.fn(async () => true);
    const { rerender } = render(<SensorsView view={view()} actions={{ busy: false, onTarget }} />);
    await pick("Aloe");
    const undo = await within(line()).findByRole("button", { name: /^Rückgängig/ });
    rerender(<SensorsView view={view()} actions={{ busy: true, onTarget }} />);
    expect(undo.getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(undo);
    expect(onTarget).toHaveBeenCalledTimes(1);
  });
});
