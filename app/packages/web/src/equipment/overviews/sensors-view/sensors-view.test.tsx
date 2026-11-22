// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SensorView } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SensorsView } from "./sensors-view";

const view = (extra: Partial<SensorView["sensors"][number]> = {}): SensorView => ({
  sensors: [{ id: "s1", name: "Feuchtesensor", status: "active", target: null, ...extra }],
  specimens: [{ id: "p1", name: "Aloe" }],
  locations: [{ id: "l1", name: "Fenster" }],
});
const actions = () => ({ busy: false, onTarget: vi.fn() });

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

  it("US-EQU-06 an unassigned sensor reads as not assigned and can be put at a specimen", async () => {
    const a = actions();
    render(<SensorsView view={view()} actions={a} />);
    const select = screen.getByRole("combobox", {
      name: "Zugeordnet zu Feuchtesensor",
    }) as HTMLSelectElement;
    expect(select.value).toBe("");
    await userEvent.setup().selectOptions(select, "specimen:p1");
    expect(a.onTarget).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: "p1",
      locationId: null,
    });
  });

  it("US-QS-32 the assignment is named by its visible text 'Zugeordnet zu' and the sensor name (WCAG 2.5.3, issue 1981)", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    const select = screen.getByRole("combobox", { name: "Zugeordnet zu Feuchtesensor" });
    expect(select.tagName).toBe("SELECT");
    // No second, longer name of its own: the name is the visible text and the sensor, not "Zuordnung von …".
    expect(screen.queryByLabelText(/Zuordnung von/)).toBeNull();
  });

  it("US-QS-32 · issue 1960 the empty choice reads 'Nicht zugeordnet', not 'Keinem (nicht zugeordnet)'", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    expect(screen.getByRole("option", { name: "Nicht zugeordnet" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Keinem (nicht zugeordnet)" })).toBeNull();
  });

  it("US-EQU-06 shows the current location and clearing sends none", async () => {
    const a = actions();
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={a}
      />,
    );
    const select = screen.getByRole("combobox", {
      name: "Zugeordnet zu Feuchtesensor",
    }) as HTMLSelectElement;
    expect(select.value).toBe("location:l1");
    await userEvent.setup().selectOptions(select, "");
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

describe("US-QS-32 · F-0160 · SG-FEED-01 the result of an assignment shows at the sensor's row", () => {
  const assign = async (a: ReturnType<typeof actions>, value: string) =>
    userEvent
      .setup()
      .selectOptions(screen.getByRole("combobox", { name: "Zugeordnet zu Feuchtesensor" }), value);
  const line = () => document.querySelector("li > p") as HTMLElement;

  it("US-QS-32 · F-0160 a row reserves its line at rest: it is empty and holds one text line, so nothing moves when the result comes", () => {
    render(<SensorsView view={view()} actions={actions()} />);
    expect(line().textContent).toBe("");
    expect(line().className.split(" ")).toContain("min-h-[1lh]");
  });

  it("US-QS-32 · F-0160 a saved assignment says 'Zugeordnet: <name>' in the row and highlights it briefly (SG-MOTION-07)", async () => {
    const a = { busy: false, onTarget: vi.fn(async () => true) };
    render(<SensorsView view={view()} actions={a} />);
    await assign(a, "specimen:p1");
    await waitFor(() => expect(line().textContent).toBe("Zugeordnet: Aloe"));
    expect(line().className.split(" ")).toContain("animate-changed");
  });

  it("US-QS-32 · F-0160 clearing an assignment says so in the row; a refused write leaves the line empty (P-10)", async () => {
    const ok = { busy: false, onTarget: vi.fn(async () => true) };
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={ok}
      />,
    );
    await assign(ok, "");
    await waitFor(() => expect(line().textContent).toBe("Nicht mehr zugeordnet"));
    cleanup();
    const refused = { busy: false, onTarget: vi.fn(async () => false) };
    render(<SensorsView view={view()} actions={refused} />);
    await assign(refused, "location:l1");
    await waitFor(() => expect(refused.onTarget).toHaveBeenCalled());
    expect(line().textContent).toBe("");
  });

  it("US-QS-32 · F-0160 · P-10 'Nicht mehr zugeordnet' depends on an empty choice only: a place the data no longer lists reads 'Zugeordnet: <label of the choice>'", async () => {
    const a = { busy: false, onTarget: vi.fn(async () => true) };
    render(<SensorsView view={view()} actions={a} />);
    const select = screen.getByRole("combobox", { name: "Zugeordnet zu Feuchtesensor" });
    // The data changed under the open list: the option is still there, its id is no longer in the lists.
    const gone = document.createElement("option");
    gone.value = "specimen:gone";
    gone.textContent = "Geist";
    select.appendChild(gone);
    await userEvent.setup().selectOptions(select, "specimen:gone");
    await waitFor(() => expect(line().textContent).toBe("Zugeordnet: Geist"));
  });

  it("US-QS-32 · F-0160 the line names a location by its name", async () => {
    const a = { busy: false, onTarget: vi.fn(async () => true) };
    render(<SensorsView view={view()} actions={a} />);
    await assign(a, "location:l1");
    await waitFor(() => expect(line().textContent).toBe("Zugeordnet: Fenster"));
  });
});
