// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokedexPage } from "../pokedex-page/pokedex-page";
import { pokedexReadAnswer } from "../pokedex-page/pokedex-reads-fake";
import { isPlain, isTinted } from "@/shared/ui/button.roles";

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
    vi.fn<typeof fetch>(async (url) =>
      Promise.resolve(
        new Response(JSON.stringify(pokedexReadAnswer(new URL(String(url)).pathname, list) ?? {}), {
          status: 200,
        }),
      ),
    ),
  );
  view(<PokedexPage api="http://api" token={token} />);
  await screen.findByRole("heading", { level: 1, name: "Arten" });
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
    expect(shown()).toEqual(["Ficus lyrata", "Ficus elastica"]);
  });

  it("US-POK-08 without a hit it says 'Keine Art gefunden' and offers the reset (P-09)", async () => {
    await open();
    await search("zzz");
    expect(screen.getByText("Keine Art gefunden")).toBeTruthy();
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
  it("US-POK-08 · US-QS-32 · SG-ICON-01 'Alle' and 'Gefangen' are available and the chosen one is marked by a check icon", async () => {
    await open();
    const layer = await openFilters();
    expect(screen.queryByText("Fehlend")).toBeNull();
    const all = within(layer).getByRole("button", { name: "Alle" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    // The marker is a visible check icon, not only aria-pressed (US-POK-08, DS-19; SG-ICON-01: no glyph).
    expect(all.querySelector("svg.lucide-check")?.getAttribute("aria-hidden")).toBe("true");
    expect(all.textContent).not.toContain("✓");
    await userEvent.click(within(layer).getByRole("button", { name: "Gefangen" }));
    const caughtChip = within(layer).getByRole("button", { name: "Gefangen" });
    expect(caughtChip.getAttribute("aria-pressed")).toBe("true");
    expect(caughtChip.querySelector("svg.lucide-check")).not.toBeNull();
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(all.querySelector("svg")).toBeNull();
    expect(shown()).toHaveLength(3);
  });

  it("US-POK-08 · US-QS-22 'Fehlend' is no chip; its reason stands in the layer: there is no catalog tree yet (P-08)", async () => {
    await open();
    const layer = await openFilters();
    expect(screen.queryByRole("button", { name: "Fehlend" })).toBeNull();
    expect(
      within(layer).getByText(
        /Fehlende Arten zeigt „Arten“ erst, wenn der Artenkatalog aufgebaut ist/,
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
    expect(shown()).toEqual(["Aloe vera", "Ficus lyrata", "Ficus elastica"]);
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

  it("US-POK-08 · US-QS-15 · SG-LIST-06 · SG-LIST-08 by family: every family is a section with its count, the chips only jump, 'n / unbekannt' is named", async () => {
    await open();
    await sortBy("Familie");
    const jump = screen.getByRole("group", { name: "Zur Familie springen" });
    // The chips are no filter: none is pressed and none carries a check icon (SG-LIST-06).
    expect(
      within(jump)
        .getAllByRole("button")
        .map((b) => [
          b.textContent,
          b.hasAttribute("aria-pressed"),
          b.querySelector("svg") !== null,
        ]),
    ).toEqual([
      ["Asphodelaceae · 1 / unbekannt", false, false],
      ["Moraceae · 2 / unbekannt", false, false],
    ]);
    // Every family is on the page: no chooser hides one (owner decision 2026-11-22).
    expect(shown()).toEqual(["Aloe vera", "Ficus lyrata", "Ficus elastica"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toContain(
      "Moraceae (Maulbeergewächse) · 2 / unbekannt",
    );
    const moraceae = screen.getByRole("region", { name: /^Moraceae/ });
    expect(
      [...moraceae.querySelectorAll("[data-species]")].map((el) => el.getAttribute("data-species")),
    ).toEqual(["Ficus lyrata", "Ficus elastica"]);
  });

  it("US-POK-08 · SG-LIST-06 a species without a known family is grouped under 'Ohne bekannte Familie', last", async () => {
    await open([species("Citrus limon"), ...caught]);
    await sortBy("Familie");
    const jump = screen.getByRole("group", { name: "Zur Familie springen" });
    const labels = within(jump)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels.at(-1)).toContain("Ohne bekannte Familie");
    const sections = screen.getAllByRole("region").filter((r) => r.hasAttribute("data-group-key"));
    const last = sections.at(-1) as HTMLElement;
    expect(last.querySelector("h2")?.textContent).toContain("Ohne bekannte Familie");
    expect(
      [...last.querySelectorAll("[data-species]")].map((el) => el.getAttribute("data-species")),
    ).toEqual(["Citrus limon"]);
  });
});

/** 101 species: Ahorn 1 … 60, Birke 1 … 40 and one Zypresse, so the list is longer than 100 rows. */
const many = [
  ...Array.from({ length: 60 }, (_, i) =>
    species(`Acer ${String(i).padStart(2, "0")}`, {
      germanName: `Ahorn ${String(i).padStart(2, "0")}`,
    }),
  ),
  ...Array.from({ length: 40 }, (_, i) =>
    species(`Betula ${String(i).padStart(2, "0")}`, {
      germanName: `Birke ${String(i).padStart(2, "0")}`,
    }),
  ),
  species("Cupressus sempervirens", { germanName: "Zypresse" }),
];
const strip = () => screen.queryByRole("slider", { name: "Zum Buchstaben springen" });

describe("US-QS-15 · SG-LIST-06 the letter index of the Pokédex: over 100 species, sorted by name", () => {
  it("US-QS-15 the strip shows beside a list of more than 100 species sorted by name, and its name is German", async () => {
    await open(many);
    expect(strip()).not.toBeNull();
    expect(document.querySelectorAll("[data-letter-index]")).toHaveLength(1);
    // The species list keeps its box: the strip is its sibling, not a cover.
    const list = screen.getByRole("list", { name: "Gefangene Arten" });
    expect(strip()?.parentElement?.contains(list)).toBe(true);
  });

  it("US-QS-15 the strip files a species under the name its row shows: the German name where there is one", async () => {
    await open(many);
    const letters = [...(strip() as HTMLElement).children];
    const present = letters
      .filter((el) => el.className.includes("text-primary"))
      .map((el) => el.textContent);
    // Acer and Betula are filed under A and B (their German names Ahorn and Birke), Cupressus under Z (Zypresse).
    expect(present).toEqual(["A", "B", "Z"]);
  });

  it("US-QS-15 the strip shows on no list of 100 species or fewer", async () => {
    await open(many.slice(0, 100));
    expect(strip()).toBeNull();
  });

  it("US-QS-15 the strip is hidden when the list is sorted otherwise, and comes back with the name order", async () => {
    await open(many);
    await sortBy("Fangdatum");
    expect(strip()).toBeNull();
    await sortBy("Alphabetisch");
    expect(strip()).not.toBeNull();
  });

  it("US-QS-15 a filter that leaves 100 species or fewer takes the strip away", async () => {
    await open(many);
    await search("Ahorn");
    expect(strip()).toBeNull();
    expect(screen.getByRole("list", { name: "Gefangene Arten" })).toBeTruthy();
  });
});

describe("US-POK-09 · US-QS-22 the details of a species are a layer", () => {
  it("US-POK-08 the group without a known family reads 'Ohne bekannte Familie' and does not say 'unbekannt' twice", async () => {
    await open([species("Citrus limon")]);
    await sortBy("Familie");
    const title = screen.getByRole("heading", { name: /Ohne bekannte Familie · / });
    expect(title.textContent).toContain("1 Art");
    expect(title.textContent).not.toContain("unbekannt");
    expect(screen.queryByText(/Familie unbekannt/)).toBeNull();
  });

  it("US-QS-08 · WCAG 2.5.3 · US-QS-32 · SG-ICON-01 the species entry's accessible name is its visible text (no aria-label, the chevron is an icon, not text)", async () => {
    await open();
    const entry = screen.getByRole("button", { name: /Aloe vera/ });
    expect(entry.hasAttribute("aria-label")).toBe(false);
    expect(entry.textContent).not.toContain("›");
    // The placeholder is an icon too; the chevron is the icon that marks the row as opening its layer.
    expect(entry.querySelector("svg.lucide-chevron-right")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("US-POK-09 · US-QS-22 a species opens its details in a layer and Escape returns the focus to its entry", async () => {
    await open();
    const entry = screen.getByRole("button", { name: /Aloe vera/ });
    await userEvent.click(entry);
    const layer = await screen.findByRole("dialog", { name: "Echte Aloe" });
    expect(within(layer).getByText("Gattung: Aloe")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(entry);
  });
});

describe("US-QS-32 the species list names a species the SG-TYPE-08 way (F-0119)", () => {
  it("US-QS-32 the entry leads with the German name, upright; the scientific name is italic on the meta line before the catch date", async () => {
    await open();
    const entry = document.querySelector('[data-species="Ficus lyrata"]') as HTMLElement;
    expect(within(entry).getByText("Geigenfeige").closest("i")).toBeNull();
    const latin = within(entry).getByText("Ficus lyrata");
    expect(latin.tagName).toBe("I");
    expect(latin.parentElement?.textContent).toBe("Ficus lyrata · gefangen 05.03.2026");
  });

  it("US-QS-32 without a German name the scientific name is the one italic title, once", async () => {
    await open([species("Opuntia ficus", { caughtDate: { date: null, source: "unknown" } })]);
    const entry = document.querySelector('[data-species="Opuntia ficus"]') as HTMLElement;
    expect(within(entry).getAllByText("Opuntia ficus")).toHaveLength(1);
    expect(within(entry).getByText("Opuntia ficus").tagName).toBe("I");
    expect(entry.textContent).toContain("Datum unbekannt");
  });
});

describe("US-QS-32 the species sheet's title follows the rule of its body (F-0119)", () => {
  it("US-QS-32 an empty German name titles the sheet with the scientific name, never an empty title", async () => {
    await open([species("Opuntia ficus", { germanName: "" })]);
    await userEvent.click(screen.getByRole("button", { name: /Opuntia ficus/ }));
    expect(await screen.findByRole("dialog", { name: "Opuntia ficus" })).toBeTruthy();
  });

  it("US-QS-32 a German name equal to the scientific one titles the sheet once, with the scientific name", async () => {
    await open([species("Ficus carica", { germanName: "Ficus carica" })]);
    await userEvent.click(screen.getByRole("button", { name: /Ficus carica/ }));
    await screen.findByRole("dialog", { name: "Ficus carica" });
    // The title is the dialog's heading; the details below it do not repeat the name.
    const details = screen.getByRole("region", { name: /Details/ });
    expect(within(details).queryByText("Ficus carica")).toBeNull();
  });
});

describe("US-QS-32 each caught species is one object row in one group (FX-35, SG-LIST-03)", () => {
  it("US-QS-32 each caught species is one row with a 56 px placeholder thumbnail, in one group of object rows", async () => {
    await open();
    const group = screen.getByRole("list", { name: "Gefangene Arten" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(3);
    // The group of object rows: the card and its corners sit on the rows (OBJECT_GROUP), not on tiles in a grid.
    expect(group.className).toContain("[&>li:first-child]:rounded-t-card");
    expect(group.className).not.toContain("md:grid-cols-2");
    // CaughtSpecies has no photo: the drawn placeholder stands in the 56 px box, never an invented picture (P-08).
    const entry = document.querySelector('[data-species="Ficus lyrata"]') as HTMLElement;
    expect(entry.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(entry.querySelector("img")).toBeNull();
  });

  it("US-QS-32 a species row says it opens a dialog and a tap opens the species layer", async () => {
    await open();
    const row = screen.getByRole("button", { name: /Aloe vera/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(row);
    expect(await screen.findByRole("dialog", { name: "Echte Aloe" })).toBeTruthy();
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("US-QS-32 · SG-BTN-01 the filter chips: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 · SG-COLOR-03 a filter chip is plain until it is chosen, the chosen one is tinted with its check and border", async () => {
    await open();
    const layer = await openFilters();
    const all = within(layer).getByRole("button", { name: "Alle" });
    const caughtChip = within(layer).getByRole("button", { name: "Gefangen" });
    expect(isTinted(all)).toBe(true);
    expect(all.className).toContain("border-primary");
    expect(isPlain(caughtChip)).toBe(true);
    await userEvent.click(caughtChip);
    expect(isTinted(within(layer).getByRole("button", { name: "Gefangen" }))).toBe(true);
    expect(isPlain(within(layer).getByRole("button", { name: "Alle" }))).toBe(true);
  });
});
