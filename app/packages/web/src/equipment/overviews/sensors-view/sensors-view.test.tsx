// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

  it("US-EQU-06 an unassigned sensor reads as not assigned and can be put at a specimen", async () => {
    const a = actions();
    render(<SensorsView view={view()} actions={a} />);
    const select = screen.getByLabelText("Zuordnung von Feuchtesensor") as HTMLSelectElement;
    expect(select.value).toBe("");
    await userEvent.setup().selectOptions(select, "specimen:p1");
    expect(a.onTarget).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), {
      specimenId: "p1",
      locationId: null,
    });
  });

  it("US-EQU-06 shows the current location and clearing sends none", async () => {
    const a = actions();
    render(
      <SensorsView
        view={view({ target: { kind: "location", id: "l1", name: "Fenster" } })}
        actions={a}
      />,
    );
    const select = screen.getByLabelText("Zuordnung von Feuchtesensor") as HTMLSelectElement;
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
