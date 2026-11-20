// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ZoneEquipmentView } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZonesView } from "./zones-view";

afterEach(cleanup);

const view: ZoneEquipmentView = {
  zones: [
    {
      zoneId: "z2",
      name: "Zone 2",
      specimens: 3,
      note: null,
      lamps: [{ id: "l1", name: "Growbox", status: "active" }],
    },
  ],
  unassigned: [],
};
const actions = () => ({ busy: false, onZone: vi.fn(), onStatus: vi.fn() });

describe("US-QS-32 · issue 1960 the lamp rows of a zone", () => {
  it("US-QS-32 · issue 1960 the state and the zone stack in one column below 480 px and sit side by side from 480 px", () => {
    const { container } = render(<ZonesView view={view} actions={actions()} />);
    const pair = container.querySelector("li > div") as HTMLElement;
    const classes = pair.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["grid", "grid-cols-1", "min-[480px]:grid-cols-2"]),
    );
    expect(classes).not.toContain("grid-cols-2");
  });

  it("US-QS-32 · issue 1960 the lamp name keeps a few pixels of space from the zone row above it", () => {
    const { container } = render(<ZonesView view={view} actions={actions()} />);
    const body = container.querySelector("details > div") as HTMLElement;
    expect(body.className.split(" ")).toContain("pt-2");
  });
});
