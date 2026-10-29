// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokedexPage } from "../pokedex-page/pokedex-page";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. */
const view = (ui: ReactElement, url = "/") =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

const species = (name: string, extra: Record<string, unknown> = {}) => ({
  species: name,
  speciesId: `id-${name.replace(" ", "-")}`,
  genus: name.split(" ")[0],
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  source: null,
  ...extra,
});
const lyrata = species("Ficus lyrata", {
  germanName: "Geigenfeige",
  familyLatin: "Moraceae",
  familyGerman: "Maulbeergewächse",
  chips: ["'Bambino'"],
  specimenCount: 3,
  caughtDate: { date: "2026-03-05", source: "caught_at" },
  source: "https://de.wikipedia.org/wiki/Geigenfeige",
});
const aloe = species("Aloe vera", { caughtDate: { date: null, source: "unknown" } });
const token = async () => "tok";
const open = async (onOpenSpecies?: (id: string) => void) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ownership: { caught: [lyrata, aloe], unidentified: [] } }), {
          status: 200,
        }),
      ),
    ),
  );
  view(
    <PokedexPage api="http://api" token={token} {...(onOpenSpecies ? { onOpenSpecies } : {})} />,
  );
  await screen.findByRole("heading", { level: 1, name: "Pokédex" });
};
const card = (name: string) => screen.getByRole("button", { name: `Details zu ${name}` });
const detail = () => screen.getByRole("region", { name: /Details/ });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-POK-09 view details of a species", () => {
  it("US-POK-09 a tap on the entry opens the details in a layer with name, genus, status, count, chips, date and source", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(await screen.findByRole("dialog", { name: "Geigenfeige" })).toBeTruthy();
    const d = within(detail());
    expect(d.getByText("Ficus lyrata")).toBeTruthy();
    expect(d.getByText(/Gattung: Ficus/)).toBeTruthy();
    expect(d.getByText(/Familie: Moraceae \(Maulbeergewächse\)/)).toBeTruthy();
    expect(d.getByText(/Status: gefangen/)).toBeTruthy();
    expect(d.getByText(/3 Exemplare/)).toBeTruthy();
    expect(d.getByText("'Bambino'")).toBeTruthy();
    expect(d.getByText(/gefangen 05.03.2026/)).toBeTruthy();
    const link = d.getByRole("link", { name: /Quelle/ });
    expect(link.getAttribute("href")).toBe("https://de.wikipedia.org/wiki/Geigenfeige");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("US-POK-09 image and short text are shown as unknown while the taxonomy build does not deliver them (P-08)", async () => {
    await open();
    await userEvent.click(card("Aloe vera"));
    const d = within(detail());
    expect(d.getByText("Noch kein Bild vorhanden.")).toBeTruthy();
    expect(d.getByText(/Kurztext: unbekannt/)).toBeTruthy();
    expect(d.getByText(/Quelle: unbekannt/)).toBeTruthy();
    expect(d.getByText(/Datum unbekannt/)).toBeTruthy();
    expect(d.getByText(/Familie: unbekannt/)).toBeTruthy();
    expect(d.queryByRole("link", { name: /Quelle/ })).toBeNull();
    expect(screen.queryByText(/US-POK/)).toBeNull();
  });

  it("US-POK-09 a source address with credentials links without them, they never reach the page (P-05)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ownership: {
                caught: [
                  species("Aloe vera", { source: "https://nutzer:geheim@example.org/aloe" }),
                ],
                unidentified: [],
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    view(<PokedexPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Details zu Aloe vera" }));
    const link = within(detail()).getByRole("link", { name: /Quelle/ });
    expect(link.getAttribute("href")).toBe("https://example.org/aloe");
    expect(detail().innerHTML).not.toContain("geheim");
  });

  it("US-POK-09 a source that is not an http(s) link is shown as plain text, never as a link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ownership: {
                caught: [species("Aloe vera", { source: "javascript:alert(1)" })],
                unidentified: [],
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    view(<PokedexPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Details zu Aloe vera" }));
    const d = within(detail());
    expect(d.queryByRole("link", { name: /Quelle/ })).toBeNull();
    expect(d.getByText(/Quelle: javascript:alert\(1\)/)).toBeTruthy();
  });

  it("US-POK-09 · US-QS-22 at most one layer is open; closing returns to the list", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(screen.getAllByRole("region", { name: /Details/ })).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Details/ })).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(1);
  });

  it("US-POK-09 Escape closes the details and the focus returns to the entry", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Details/ })).toBeNull();
    expect(document.activeElement).toBe(card("Ficus lyrata"));
  });

  it("US-POK-09 the card opens by keyboard", async () => {
    await open();
    card("Aloe vera").focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Aloe vera" })).toBeTruthy();
  });

  it("US-POK-09 the link to the species profile reports the species ID outward", async () => {
    const onOpenSpecies = vi.fn();
    await open(onOpenSpecies);
    await userEvent.click(card("Ficus lyrata"));
    await userEvent.click(within(detail()).getByRole("button", { name: "Zum Artprofil" }));
    expect(onOpenSpecies).toHaveBeenCalledWith("id-Ficus-lyrata");
  });

  it("US-POK-09 without a wired profile there is no dead link", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(within(detail()).queryByRole("button", { name: "Zum Artprofil" })).toBeNull();
  });

  it("US-POK-09 the actions for missing species (wishlist, friend has it) are not offered for a caught species", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(within(detail()).queryByRole("button", { name: /Wunschliste/ })).toBeNull();
    expect(within(detail()).queryByText(/Freund/)).toBeNull();
  });
});

describe("US-POK-09 · US-QS-22 the layer of a species is in the address", () => {
  it("US-POK-09 · US-QS-22 an address with the layer of a species opens its details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ ownership: { caught: [lyrata, aloe], unidentified: [] } }),
            { status: 200 },
          ),
        ),
      ),
    );
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=species-Aloe vera");
    expect((await screen.findByRole("region", { name: /Details/ })).textContent).toContain(
      "Gattung: Aloe",
    );
  });

  it("US-POK-09 every entry shows a visible tap marker (chevron), not only the hover state", async () => {
    await open();
    const marker = card("Ficus lyrata").closest("li")?.querySelector("[data-chevron]");
    expect(marker?.textContent).toBe("›");
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
  });
});
