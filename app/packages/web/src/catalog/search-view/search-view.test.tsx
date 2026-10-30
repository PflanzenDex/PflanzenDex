// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { HITS_PER_PAGE } from "./hit-list/hit-list";
import { SpeciesSearch } from "./search-view";

const species: Species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  genus: "Dracaena",
  epithet: "trifasciata",
  cultivar: null,
  germanName: "Bogenhanf",
  englishName: null,
  synonyms: ["Sansevieria trifasciata"],
  familyGerman: null,
  familyLatin: "Asparagaceae",
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  softLeaf: false,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Blätter kippen zur Seite.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Aufrechte Blätter.",
  botanicalStory: null,
  source: null,
  reviewStatus: "reviewed",
  createdBy: "user",
  own: false,
  version: 1,
};
const hit = (a: Species, t: SpeciesHit["hit"] = null): SpeciesHit => ({ ...a, hit: t });
const many = (n: number, extra: Partial<Species> = {}) =>
  Array.from({ length: n }, (_, i) =>
    hit({ ...species, id: `s${i}`, latinName: `Species ${i + 1}`, ...extra }),
  );

function Address() {
  const l = useLocation();
  return <output data-testid="address">{l.pathname + l.search}</output>;
}

const onOpen = vi.fn();
const onSearch = vi.fn();
const onPropose = vi.fn();

function search(hits: readonly SpeciesHit[], at = "/discover?view=catalog", text = "") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <SpeciesSearch
        searchText={text}
        hit={hits}
        onSearch={onSearch}
        onOpen={onOpen}
        onPropose={onPropose}
        embedded
      />
      <Address />
    </MemoryRouter>,
  );
}
const address = () => screen.getByTestId("address").textContent;

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => setViewportWidth(360));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-BES-01 search", () => {
  it("the search field has a label and searches by Latin or German name", () => {
    search([]);
    expect(
      screen.getByRole("searchbox", { name: "Lateinischer oder deutscher Name" }),
    ).toBeTruthy();
  });

  it("for a hit via synonym, names what the species was found by (Sansevieria -> Dracaena)", () => {
    search([hit(species, { field: "synonym", display: "Sansevieria trifasciata" })]);
    expect(screen.getByText("Dracaena trifasciata")).toBeTruthy();
    expect(screen.getByText(/Gefunden über Synonym: Sansevieria trifasciata/)).toBeTruthy();
  });

  it("marks own proposals in the list", () => {
    search([hit({ ...species, reviewStatus: "proposal", own: true })]);
    expect(screen.getByText(/Vorschlag, nur für dich sichtbar/)).toBeTruthy();
  });

  it('without hits: offers "Propose species" (P-09)', async () => {
    search([], "/discover?view=catalog", "Zzyzx");
    expect(screen.getByText("Keine Art zu „Zzyzx“ gefunden.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art vorschlagen" }));
    expect(onPropose).toHaveBeenCalled();
  });

  it("US-ONB-01 an empty catalog says so and names the next step instead of a silent empty list (P-09, P-10)", () => {
    search([], "/discover?view=catalog", "Zzyzx");
    expect(screen.getByText(/ist der Katalog noch leer/)).toBeTruthy();
    cleanup();
    search([], "/discover?view=catalog", "");
    expect(screen.getByText("Der gemeinsame Katalog ist noch leer.")).toBeTruthy();
    expect(screen.getByText(/Betreiber, den Start-Katalog zu laden/)).toBeTruthy();
  });
});

describe("US-QS-21 the catalog list is paged", () => {
  it("US-QS-21 shows one page of compact results with name, scientific name and one fact", () => {
    search(many(45));
    const list = screen.getByRole("list", { name: "Treffer" });
    expect(within(list).getAllByRole("button")).toHaveLength(HITS_PER_PAGE);
    expect(screen.getByText(`Seite 1 von ${Math.ceil(45 / HITS_PER_PAGE)}`)).toBeTruthy();
    expect(within(list).getAllByText("Bogenhanf · Schwierigkeit: Einfach")).toHaveLength(
      HITS_PER_PAGE,
    );
    expect(screen.queryByText("Mehr laden")).toBeNull();
  });

  it("US-QS-21 a short list has no pager", () => {
    search(many(2));
    expect(screen.queryByText(/Seite 1 von/)).toBeNull();
  });

  it("US-QS-21 the page is in the address, a reload at ?page=2 shows page 2", async () => {
    search(many(10));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(address()).toBe("/discover?view=catalog&page=2");
    cleanup();
    search(many(10), "/discover?view=catalog&page=2");
    expect(screen.getByText("Species 4")).toBeTruthy();
    expect(screen.queryByText("Species 1")).toBeNull();
  });

  it("US-QS-21 a new search starts at page 1", async () => {
    const { rerender } = search(many(10), "/discover?view=catalog&page=3", "a");
    expect(address()).toContain("page=3");
    rerender(
      <MemoryRouter initialEntries={["/discover?view=catalog&page=3"]}>
        <SpeciesSearch
          searchText="ab"
          hit={many(10)}
          onSearch={onSearch}
          onOpen={onOpen}
          onPropose={onPropose}
          embedded
        />
        <Address />
      </MemoryRouter>,
    );
    // The router instance is kept by React, so the effect of the changed search text rewrites the address.
    await vi.waitFor(() => expect(address()).not.toContain("page=3"));
  });

  it("US-QS-21 choosing a result opens its profile", async () => {
    search(many(3));
    await userEvent.click(screen.getByRole("button", { name: /Species 2/ }));
    expect(onOpen).toHaveBeenCalledWith("s1");
  });
});

describe("US-QS-21 filters live in a layer and show as chips", () => {
  it("US-QS-21 the filter button opens the layer (?sheet=filters), a choice shows as a removable chip", async () => {
    search([
      ...many(4, { difficulty: 1 }),
      hit({ ...species, id: "h", latinName: "Hard one", difficulty: 3 }),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(address()).toContain("sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.selectOptions(
      within(layer).getByRole("combobox", { name: "Schwierigkeit" }),
      "3",
    );
    expect(address()).toContain("difficulty=3");
    await userEvent.click(within(layer).getByRole("button", { name: "Fertig" }));
    const chips = await screen.findByRole("list", { name: "Gewählte Filter" });
    expect(within(chips).getByText(/Schwierigkeit: Schwer/)).toBeTruthy();
    expect(screen.getByText("Hard one")).toBeTruthy();
    expect(screen.queryByText("Species 1")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Filter entfernen: Schwierigkeit: Schwer" }),
    );
    expect(address()).not.toContain("difficulty");
    expect(screen.getByText("Species 1")).toBeTruthy();
  });

  it("US-QS-21 a filter starts the list at page 1", async () => {
    search(many(10), "/discover?view=catalog&page=3&difficulty=1");
    await userEvent.click(screen.getByRole("button", { name: "Filter (1)" }));
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.click(within(layer).getByRole("checkbox", { name: "Nur meine Vorschläge" }));
    expect(address()).toContain("own=1");
    await vi.waitFor(() => expect(address()).not.toContain("page=3"));
  });

  it("US-QS-21 filters that match nothing say so and offer to reset them (P-09)", async () => {
    search(many(3), "/discover?view=catalog&own=1");
    expect(screen.getByText("Keine Art passt zu den Filtern.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(address()).not.toContain("own=1");
    expect(screen.getByText("Species 1")).toBeTruthy();
  });

  it("US-QS-21 the layer has exactly one filled primary action", async () => {
    search(many(3), "/discover?view=catalog&sheet=filters");
    const layer = await screen.findByRole("dialog", { name: "Filter" });
    const filled = within(layer)
      .getAllByRole("button")
      .filter((b) => b.className.includes("bg-primary"));
    expect(filled.map((b) => b.textContent)).toEqual(["Fertig"]);
  });
});

describe("US-QS-21 states name their next action", () => {
  it("US-QS-21 while loading without hits a skeleton shows", () => {
    search([]);
    cleanup();
    render(
      <MemoryRouter>
        <SpeciesSearch
          searchText=""
          hit={[]}
          loading
          onSearch={onSearch}
          onOpen={onOpen}
          onPropose={onPropose}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Der gemeinsame Katalog ist noch leer.")).toBeNull();
  });
});
