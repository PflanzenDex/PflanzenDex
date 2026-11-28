// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ZoneEquipmentView } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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

describe("US-QS-15 SG-TYPE-05 the line 'lamps · plants' of a zone breaks only between its parts (issue 2640)", () => {
  beforeEach(() => setViewportWidth(360));

  it("US-QS-15 at 360 px the lamps and the plants are one part each, and the text of the line is the same", () => {
    const { container } = render(<ZonesView view={view} actions={actions()} />);
    const summary = container.querySelector("details > summary") as HTMLElement;
    const parts = Array.from(summary.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["1 Lampe ·", "3 Pflanzen"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    expect(plain(parts[0]?.parentElement?.textContent)).toBe("1 Lampe · 3 Pflanzen");
  });

  it("US-QS-15 a zone with an unknown plant count reads it as the second part", () => {
    const unknown: ZoneEquipmentView = {
      ...view,
      zones: [{ ...(view.zones[0] as (typeof view.zones)[number]), specimens: null }],
    };
    const { container } = render(<ZonesView view={unknown} actions={actions()} />);
    const parts = Array.from(container.querySelectorAll<HTMLElement>("summary [data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["1 Lampe ·", "Pflanzenzahl unbekannt"]);
  });
});
