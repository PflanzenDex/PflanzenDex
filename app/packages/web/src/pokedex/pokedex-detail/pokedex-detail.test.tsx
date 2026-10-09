// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokedexPage } from "../pokedex-page/pokedex-page";

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
  render(
    <PokedexPage api="http://api" token={token} {...(onOpenSpecies ? { onOpenSpecies } : {})} />,
  );
  await screen.findByRole("heading", { level: 1, name: "Pokédex" });
};
const card = (name: string) => screen.getByRole("button", { name: `Details zu ${name}` });
const detail = () => screen.getByRole("region", { name: /Details/ });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // jsdom keeps the history across tests; a detail entry left behind would open its species in the next test.
  window.history.replaceState(null, "");
});

describe("US-POK-09 view details of a species", () => {
  it("US-POK-09 a tap on the card opens the details with name, genus, status, count, chips, date and source", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    const d = within(detail());
    expect(d.getByRole("heading", { level: 2, name: "Geigenfeige" })).toBeTruthy();
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
    render(<PokedexPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Details zu Aloe vera" }));
    const d = within(detail());
    expect(d.queryByRole("link", { name: /Quelle/ })).toBeNull();
    expect(d.getByText(/Quelle: javascript:alert\(1\)/)).toBeTruthy();
  });

  it("US-POK-09 at most one detail view is open; it replaces the list and closing is unambiguous", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(screen.getAllByRole("region", { name: /Details/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Details zu Aloe vera" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("region", { name: /Details/ })).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(1);
  });

  it("US-POK-09 Escape closes the details and the focus returns to the card", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: "Geigenfeige" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Details/ })).toBeNull();
    expect(document.activeElement).toBe(card("Ficus lyrata"));
  });

  it("US-POK-09 the card opens by keyboard", async () => {
    await open();
    card("Aloe vera").focus();
    await userEvent.keyboard("{Enter}");
    expect(within(detail()).getByRole("heading", { level: 2, name: "Aloe vera" })).toBeTruthy();
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

describe("US-POK-09 follow-ups of the detail view (issue 297)", () => {
  it("US-POK-09 the browser Back button closes the detail view instead of leaving the page", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    expect(screen.getByRole("region", { name: /Details/ })).toBeTruthy();
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("region", { name: /Details/ })).toBeNull());
    expect(card("Ficus lyrata")).toBeTruthy();
  });

  it("US-POK-09 Forward after Back opens the same species again instead of a stale, empty entry (#306)", async () => {
    await open();
    await userEvent.click(card("Ficus lyrata"));
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("region", { name: /Details/ })).toBeNull());
    window.history.forward();
    await waitFor(() => expect(detail().textContent).toContain("Ficus lyrata"));
  });

  it("US-POK-09 a detail entry reached from elsewhere in the history opens its species (#306)", async () => {
    window.history.pushState({ pokedexDetail: true, species: "Aloe vera" }, "");
    await open();
    expect((await screen.findByRole("region", { name: /Details/ })).textContent).toContain(
      "Aloe vera",
    );
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("region", { name: /Details/ })).toBeNull());
  });

  it("US-POK-09 closing with the button takes back the history entry the opening pushed (one Back, no extra entry)", async () => {
    await open();
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back");
    await userEvent.click(card("Ficus lyrata"));
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Details/ })).toBeNull());
    expect(push).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    push.mockRestore();
    back.mockRestore();
  });

  it("US-POK-09 every card shows a visible tap marker (chevron), not only the hover state", async () => {
    await open();
    const marker = card("Ficus lyrata").closest("li")?.querySelector("[data-chevron]");
    expect(marker?.textContent).toBe("›");
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-POK-09 two rapid close triggers (double click, double Escape) take the history entry back only once", async () => {
    await open();
    const back = vi.spyOn(window.history, "back");
    await userEvent.click(card("Ficus lyrata"));
    const close = screen.getByRole("button", { name: "Schließen" });
    fireEvent.click(close);
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region", { name: /Details/ })).toBeNull());
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});
