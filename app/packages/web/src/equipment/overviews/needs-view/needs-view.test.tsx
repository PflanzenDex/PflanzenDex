// @vitest-environment jsdom
import { cleanup, render as plainRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import type { Need } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsView } from "./needs-view";

afterEach(cleanup);

const render = (ui: ReactElement) => plainRender(<MemoryRouter>{ui}</MemoryRouter>);
const noop = () => undefined;

const need = (over: Partial<Need> & Pick<Need, "id">): Need => ({
  kind: "supply_low",
  reason: `${over.id} wird knapp.`,
  source: "Vorrat unter Geräte",
  nextAction: "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“.",
  target: null,
  ...over,
});

describe("US-EQU-07 what is missing", () => {
  it("US-EQU-07 · US-QS-15 · issue 2535 the needs are the plain content of the layer: every need is on the list, with no page fit and no page bar", () => {
    render(
      <NeedsView needs={[need({ id: "a" }), need({ id: "b" }), need({ id: "c" })]} fill={noop} />,
    );
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list.hasAttribute("data-page-fit")).toBe(false);
    expect(list.hasAttribute("data-scroll-region")).toBe(false);
    expect(screen.queryByRole("button", { name: /^(Weiter|Zurück)$/ })).toBeNull();
  });

  it("US-EQU-07 says so when nothing is missing", () => {
    render(<NeedsView needs={[]} fill={noop} />);
    expect(screen.getByText(/fehlt nichts/)).toBeTruthy();
  });
});

describe("US-QS-32 needs are rows titled by their next action, opening where it is done", () => {
  it("US-QS-32 each need is one row: the core's next action as its title, the reason and the source as one meta line", () => {
    render(
      <NeedsView
        needs={[
          need({
            id: "supply:1",
            reason: "„Erde“ wird knapp.",
            nextAction: "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“.",
          }),
        ]}
        fill={noop}
      />,
    );
    const row = screen.getByText(/Kaufe Nachschub/).closest("li");
    expect(row?.textContent).toBe(
      "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“. „Erde“ wird knapp. Quelle: Vorrat unter Geräte",
    );
  });

  it("US-QS-32 a need whose step is done in the app with a device is one link to the device's record, with a chevron", () => {
    render(
      <NeedsView
        needs={[
          need({
            id: "replace:lamp-7",
            kind: "no_replacement",
            nextAction: "Repariere das Gerät, erfasse ein Ersatzgerät oder wünsche dir eines.",
            target: { kind: "device", id: "lamp-7" },
          }),
        ]}
        fill={noop}
      />,
    );
    const link = screen.getByRole("link", { name: /Repariere das Gerät/ });
    expect(link.getAttribute("href")).toBe("/collection?view=equipment&sheet=item-lamp-7");
    expect(link.querySelector("svg.lucide-chevron-right")).not.toBeNull();
  });

  it("US-QS-32 a need for a lamp in a light zone opens the form with that zone filled in, and the row is its opener", async () => {
    const fill = vi.fn();
    render(
      <NeedsView
        needs={[
          need({
            id: "zone:zone-3",
            kind: "zone_without_lamp",
            reason: "Die Lichtzone Zone 3 hat 14 Pflanzen, aber keine aktive Lampe.",
            source: "Pflanzen je Lichtzone",
            nextAction: "Ordne dieser Zone eine aktive Lampe zu oder erfasse eine neue Lampe.",
            target: { kind: "zone", zoneId: "zone-3" },
          }),
        ]}
        fill={fill}
      />,
    );
    const row = screen.getByRole("button", { name: /Ordne dieser Zone eine aktive Lampe zu/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(row);
    expect(fill).toHaveBeenCalledWith(
      { type: "Lamp", name: "", productId: null, priceEur: null, lightZoneId: "zone-3" },
      row,
    );
  });

  it("US-QS-32 a need whose step happens outside the app is plain text: no link, no button, no chevron, and no record opens for buying", () => {
    render(<NeedsView needs={[need({ id: "supply:soil" })]} fill={noop} />);
    const row = screen.getByText(/Kaufe Nachschub/).closest("li") as HTMLElement;
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.querySelector("svg")).toBeNull();
  });

  it("US-QS-32 the needs form one flat group of rows, not a box per need", () => {
    render(<NeedsView needs={[need({ id: "a" }), need({ id: "b" })]} fill={noop} />);
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(list.className).toContain("[&>li:first-child]:rounded-t-card");
    for (const row of rows) expect(row.className).not.toContain("rounded-lg");
  });

  it("US-QS-32 · issue 2535 the list of the needs is as high as its rows (no size containment), and the section never shrinks below its content, so the rows never lie under the recommendations at 200 % text (issues 2272, 2535)", () => {
    render(<NeedsView needs={[need({ id: "a" }), need({ id: "b" })]} fill={noop} />);
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    // Size containment would make the list 0 px high in the layer: its rows would run over what stands below the list.
    expect(list.className).not.toContain("contain:size");
    // A row never shrinks below its content, so a squeezed list cannot collapse it to its borders (issue 2272). The list
    // gives each of its rows that rule (issue 2315), so the list needs no rule of its own.
    for (const row of within(list).getAllByRole("listitem"))
      expect(row.classList.contains("shrink-0")).toBe(true);
    const section = list.closest("section") as HTMLElement;
    expect(section.className.split(" ")).not.toContain("min-h-0");
  });
});
