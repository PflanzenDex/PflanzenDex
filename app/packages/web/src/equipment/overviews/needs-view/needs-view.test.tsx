// @vitest-environment jsdom
import { cleanup, render as plainRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import type { Need } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsView, needTarget } from "./needs-view";

afterEach(cleanup);

const render = (ui: ReactElement) => plainRender(<MemoryRouter>{ui}</MemoryRouter>);
const noop = () => undefined;

const need = (id: string, kind: Need["kind"] = "supply_low"): Need => ({
  id,
  kind,
  reason: `${id} wird knapp.`,
  source: "Vorrat unter Geräte",
  nextAction: "Kaufe Nachschub.",
});

describe("US-EQU-07 what is missing", () => {
  it("US-EQU-07 · US-QS-15 · issue 1154 the needs page by the free height of the layer", () => {
    render(<NeedsView needs={[need("a"), need("b"), need("c")]} fill={noop} />);
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
  });

  it("US-EQU-07 says so when nothing is missing", () => {
    render(<NeedsView needs={[]} fill={noop} />);
    expect(screen.getByText(/fehlt nichts/)).toBeTruthy();
  });
});

describe("US-QS-32 needs are rows titled by their step (SG-TOUCH-02, SG-LIST-04)", () => {
  it("US-QS-32 each need is one row: the step as its title, the reason and the source as one meta line", () => {
    render(
      <NeedsView
        needs={[
          {
            id: "supply:1",
            kind: "supply_low",
            reason: "„Erde“ wird knapp.",
            source: "Vorrat unter Geräte",
            nextAction: "Kaufe Nachschub.",
          },
        ]}
        fill={noop}
      />,
    );
    const row = screen.getByRole("link", { name: /Nachschub kaufen/ });
    expect(row.textContent).toBe("Nachschub kaufen „Erde“ wird knapp. Quelle: Vorrat unter Geräte");
    expect(screen.queryByText("Kaufe Nachschub.")).toBeNull();
  });

  it("US-QS-32 a device need is one link to the device's record, with a chevron", () => {
    render(<NeedsView needs={[need("replace:lamp-7", "no_replacement")]} fill={noop} />);
    const link = screen.getByRole("link", { name: /Gerät reparieren oder ersetzen/ });
    expect(link.getAttribute("href")).toBe("/collection?view=equipment&sheet=item-lamp-7");
    expect(link.querySelector("svg.lucide-chevron-right")).not.toBeNull();
  });

  it("US-QS-32 a lamp need is a row that opens the form with its light zone filled in", async () => {
    const fill = vi.fn();
    render(
      <NeedsView
        needs={[
          {
            id: "zone:zone-3",
            kind: "zone_without_lamp",
            reason: "14 Pflanzen stehen in Zone 3 ohne aktive Lampe.",
            source: "Pflanzen je Lichtzone",
            nextAction: "Erfasse eine Lampe.",
          },
        ]}
        fill={fill}
      />,
    );
    const row = screen.getByRole("button", { name: /Lampe erfassen/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(row);
    expect(fill).toHaveBeenCalledWith({
      type: "Lamp",
      name: "",
      productId: null,
      priceEur: null,
      lightZoneId: "zone-3",
    });
  });

  it("US-QS-32 the target of each need is read from the key of its cause: a device or a light zone", () => {
    expect(needTarget(need("wish-zone:zone-2", "wish_without_lamp"))).toEqual({
      kind: "lamp",
      zoneId: "zone-2",
    });
    expect(needTarget(need("zone:zone-1", "zone_without_lamp"))).toEqual({
      kind: "lamp",
      zoneId: "zone-1",
    });
    expect(needTarget(need("supply:abc", "supply_low"))).toEqual({ kind: "device", id: "abc" });
    expect(needTarget(need("replace:def", "no_replacement"))).toEqual({
      kind: "device",
      id: "def",
    });
  });

  it("US-QS-32 the needs form one flat group of rows, not a box per need", () => {
    render(<NeedsView needs={[need("a"), need("b")]} fill={noop} />);
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(list.className).toContain("rounded-card");
    for (const row of rows) expect(row.className).not.toContain("rounded-lg");
  });
});
