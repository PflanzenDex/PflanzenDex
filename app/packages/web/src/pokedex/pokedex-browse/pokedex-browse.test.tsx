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
  genus: name.split(" ")[0],
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  ...extra,
});
const moraceae = { familyLatin: "Moraceae", familyGerman: "Maulbeergewächse" };
const caught = [
  species("Ficus lyrata", {
    ...moraceae,
    germanName: "Geigenfeige",
    caughtDate: { date: "2026-03-05", source: "caught_at" },
  }),
  species("Ficus elastica", {
    ...moraceae,
    germanName: "Gummibaum",
    caughtDate: { date: "2026-08-01", source: "created_at" },
  }),
  species("Aloe vera", {
    germanName: "Echte Aloe",
    familyLatin: "Asphodelaceae",
    caughtDate: { date: null, source: "unknown" },
    genusSpeciesCount: 9,
  }),
];
const token = async () => "tok";
const open = async (list = caught) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ownership: { caught: list, unidentified: [] } }), {
          status: 200,
        }),
      ),
    ),
  );
  view(<PokedexPage api="http://api" token={token} />);
  await screen.findByRole("heading", { level: 1, name: "Pokédex" });
};
const shown = () =>
  [...document.querySelectorAll("[data-species]")].map((el) => el.getAttribute("data-species"));
const search = (text: string) =>
  userEvent.type(screen.getByRole("searchbox", { name: /Suche/ }), text);
const openFilters = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog", { name: "Filter" });
};
const sortBy = async (label: string) => {
  const layer = await openFilters();
  await userEvent.selectOptions(within(layer).getByRole("combobox", { name: "Sortierung" }), label);
  await userEvent.keyboard("{Escape}");
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-22 search and filter sit in one row", () => {
  it("US-QS-22 the search field and the button 'Filter' share one row", async () => {
    await open();
    const searchbox = screen.getByRole("searchbox", { name: /Suche/ });
    const filter = screen.getByRole("button", { name: "Filter" });
    expect(searchbox.closest("div.flex")?.contains(filter)).toBe(true);
  });
});

describe("US-POK-08 search", () => {
  it("US-POK-08 finds case-insensitively by species, German name, genus and family", async () => {
    await open();
    await search("GEIGEN");
    expect(shown()).toEqual(["Ficus lyrata"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: /Suche/ }));
    await search("asphodel");
    expect(shown()).toEqual(["Aloe vera"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: /Suche/ }));
    await search("ficus");
    expect(shown()).toEqual(["Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 without a hit it says 'Keine Art gefunden.' and offers the reset (P-09)", async () => {
    await open();
    await search("zzz");
    expect(screen.getByText("Keine Art gefunden.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
    expect(shown()).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: /Suche/ }));
  });

  it("US-POK-08 shows how many species match", async () => {
    await open();
    await search("ficus");
    expect(screen.getByText("2 von 3 Arten")).toBeTruthy();
  });
});

describe("US-POK-08 filter in the layer 'Filter' (US-QS-22)", () => {
  it("US-POK-08 'Alle' and 'Gefangen' are available and the chosen one is marked", async () => {
    await open();
    const layer = await openFilters();
    expect(screen.queryByText("Fehlend")).toBeNull();
    const all = within(layer).getByRole("button", { name: "Alle" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    // The marker is a visible check mark, not only aria-pressed (US-POK-08, DS-19).
    expect(all.textContent).toContain("✓");
    await userEvent.click(within(layer).getByRole("button", { name: "Gefangen" }));
    const caughtChip = within(layer).getByRole("button", { name: "Gefangen" });
    expect(caughtChip.getAttribute("aria-pressed")).toBe("true");
    expect(caughtChip.textContent).toContain("✓");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(all.textContent).not.toContain("✓");
    expect(shown()).toHaveLength(3);
  });

  it("US-POK-08 · US-QS-22 'Fehlend' is no chip; its reason stands in the layer: there is no catalog tree yet (P-08)", async () => {
    await open();
    const layer = await openFilters();
    expect(screen.queryByRole("button", { name: "Fehlend" })).toBeNull();
    expect(
      within(layer).getByText(
        /Fehlende Arten zeigt der Pokédex erst, wenn der Artenkatalog aufgebaut ist/,
      ),
    ).toBeTruthy();
  });

  it("US-POK-08 · US-QS-22 the filters that cannot be used yet show their reason as text and no internal story ID", async () => {
    await open([species("Ficus lyrata")]);
    const layer = await openFilters();
    expect(within(layer).queryByRole("button", { name: "Artenarm" })).toBeNull();
    expect(within(layer).getByText(/„Artenarm“: braucht die Artenzahl der Gattungen/)).toBeTruthy();
    expect(screen.queryByText(/US-POK/)).toBeNull();
  });

  it("US-POK-08 'Artenarm' is a chip only once a genus species count is known, and then it works", async () => {
    await open();
    const layer = await openFilters();
    await userEvent.click(within(layer).getByRole("button", { name: "Artenarm" }));
    expect(shown()).toEqual(["Aloe vera"]);
    expect(within(layer).queryByText(/braucht die Artenzahl/)).toBeNull();
  });
});

describe("US-POK-08 sort", () => {
  it("US-POK-08 alphabetical is the default flat list", async () => {
    await open();
    expect(shown()).toEqual(["Aloe vera", "Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 by catch date: newest first, without date last", async () => {
    await open();
    await sortBy("Fangdatum");
    expect(shown()).toEqual(["Ficus elastica", "Ficus lyrata", "Aloe vera"]);
  });

  it("US-POK-08 by species count: ascending, and it says the count is unknown for all (P-08)", async () => {
    await open([species("Ficus lyrata"), species("Aloe vera")]);
    const layer = await openFilters();
    await userEvent.selectOptions(
      within(layer).getByRole("combobox", { name: "Sortierung" }),
      "Artenzahl",
    );
    expect(shown()).toEqual(["Aloe vera", "Ficus lyrata"]);
    expect(within(layer).getByText(/Artenzahl der Gattungen ist noch unbekannt/)).toBeTruthy();
  });

  it("US-POK-08 · US-QS-22 by family: the family is chosen from a row with its count, 'n / unbekannt' is named", async () => {
    await open();
    await sortBy("Familie");
    const choices = screen.getByRole("group", { name: "Familie wählen" });
    expect(
      within(choices)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["✓Asphodelaceae (1)", "Moraceae (2)"]);
    expect(shown()).toEqual(["Aloe vera"]);
    await userEvent.click(within(choices).getByRole("button", { name: /Moraceae/ }));
    expect(screen.getByText(/Moraceae \(Maulbeergewächse\) · 2 \/ unbekannt/)).toBeTruthy();
    expect(shown()).toEqual(["Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 a species without a known family is grouped under 'Ohne bekannte Familie', last", async () => {
    await open([species("Citrus limon"), ...caught]);
    await sortBy("Familie");
    const choices = screen.getByRole("group", { name: "Familie wählen" });
    const labels = within(choices)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels.at(-1)).toContain("Ohne bekannte Familie");
    await userEvent.click(within(choices).getByRole("button", { name: /Ohne bekannte Familie/ }));
    expect(shown()).toEqual(["Citrus limon"]);
  });
});

describe("US-POK-09 · US-QS-22 the details of a species are a layer", () => {
  it("US-POK-08 the group without a known family reads 'Ohne bekannte Familie' and does not say 'unbekannt' twice", async () => {
    await open([species("Citrus limon")]);
    await sortBy("Familie");
    const title = screen.getByText(/Ohne bekannte Familie · /);
    expect(title.textContent).toContain("1 Art");
    expect(title.textContent).not.toContain("unbekannt");
    expect(screen.queryByText(/Familie unbekannt/)).toBeNull();
  });

  it("US-POK-09 · US-QS-22 a species opens its details in a layer and Escape returns the focus to its entry", async () => {
    await open();
    const entry = screen.getByRole("button", { name: "Details zu Aloe vera" });
    await userEvent.click(entry);
    const layer = await screen.findByRole("dialog", { name: "Echte Aloe" });
    expect(within(layer).getByText("Gattung: Aloe")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(entry);
  });
});
