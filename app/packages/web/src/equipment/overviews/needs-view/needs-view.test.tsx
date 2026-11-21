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
  it("US-EQU-07 · US-QS-15 · issue 1154 the needs page by the free height of the layer", () => {
    render(
      <NeedsView needs={[need({ id: "a" }), need({ id: "b" }), need({ id: "c" })]} fill={noop} />,
    );
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
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

  it("US-QS-32 the rows of the needs do not count towards the height of their section, and the section never shrinks below its content, so the pager never falls under the recommendations at 200 % text (issue 2272)", () => {
    render(<NeedsView needs={[need({ id: "a" }), need({ id: "b" })]} fill={noop} />);
    const list = screen.getByRole("list", { name: "Fehlt / Nachkaufen" });
    // Size containment (issue 1113, as the today page) from 768 px, where the list pages: the page size follows the free
    // height, not the rows on the page. Below it the list scrolls with the page, so its rows give it its height.
    expect(list.className).toContain("md:[contain:size]");
    expect(list.className).not.toMatch(/(^|\s)\[contain:size\]/);
    // A row never shrinks below its content, so a squeezed list cannot collapse it to its borders (issue 2272).
    expect(list.className).toContain("[&>li]:shrink-0");
    const section = list.closest("section") as HTMLElement;
    expect(section.className.split(" ")).not.toContain("min-h-0");
  });
});
