import { renderToString as render } from "react-dom/server";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { SpeciesProfile } from "./profile-view";
import { SpeciesSearch } from "./search-view";
import { ProposalForm } from "./proposal-form";
import { duplicate, formToInput } from "./form";

// React separates adjacent text parts with comments in server rendering; for text checks we remove them.
const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");

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

describe("US-BES-01 profile of a species (fields from DM-BES-01)", () => {
  it('shows the details; unknown means "unknown", nothing is invented (P-08)', () => {
    const h = renderToString(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Sansevieria trifasciata");
    expect(h).toContain("Einfach");
    expect(h).toContain("15.000 Lux");
    expect(h).toContain("Höhe");
    expect(h).toContain("Blätter kippen zur Seite.");
    expect(h).toMatch(/Ruhephase<\/dt><dd>unbekannt/);
    expect(h).toMatch(/Englischer Name<\/dt><dd>unbekannt/);
    expect(h).toMatch(/Quelle<\/dt><dd>unbekannt/);
  });

  it("approved species: marked as reviewed, with a button to choose", () => {
    const h = renderToString(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    expect(h).toContain("Geprüft");
    expect(h).toContain("Diese Art wählen");
  });

  it("proposal: visible only to the creator, says what to do next (P-09, FR-BES-11)", () => {
    const h = renderToString(
      <SpeciesProfile
        species={{ ...species, reviewStatus: "proposal", own: true }}
        onChoose={vi.fn()}
      />,
    );
    expect(h).toContain("Vorschlag");
    expect(h).toContain("nur für dich sichtbar");
    expect(h).toContain("Art prüfen lassen, dann zählt sie.");
    expect(h).toContain("Diese Art wählen");
  });

  it("genus only: allowed, but without Pokédex catch", () => {
    const h = renderToString(
      <SpeciesProfile species={{ ...species, epithet: null }} onChoose={vi.fn()} />,
    );
    expect(h).toContain("zählt nicht als Pokédex-Fang");
  });
});

describe("US-BES-01 search", () => {
  const actions = { onSearch: vi.fn(), onOpen: vi.fn(), onPropose: vi.fn() };

  it("the search field has a label and searches by Latin or German name", () => {
    const h = renderToString(<SpeciesSearch searchText="" hit={[]} {...actions} />);
    expect(h).toContain("Lateinischer oder deutscher Name");
    expect(h).toContain('type="search"');
  });

  it("for a hit via synonym, names what the species was found by (Sansevieria -> Dracaena)", () => {
    const h = renderToString(
      <SpeciesSearch
        searchText="sansevieria"
        hit={[hit(species, { field: "synonym", display: "Sansevieria trifasciata" })]}
        {...actions}
      />,
    );
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Gefunden über Synonym: Sansevieria trifasciata");
  });

  it("marks own proposals in the list", () => {
    const h = renderToString(
      <SpeciesSearch
        searchText=""
        hit={[hit({ ...species, reviewStatus: "proposal", own: true })]}
        {...actions}
      />,
    );
    expect(h).toContain("Vorschlag, nur für dich sichtbar");
  });

  it('without hits: offers "Propose species" (P-09)', () => {
    const h = renderToString(<SpeciesSearch searchText="Zzyzx" hit={[]} {...actions} />);
    expect(h).toContain("Keine Art zu „Zzyzx“ gefunden");
    expect(h).toContain("Art vorschlagen");
  });
});

describe('US-BES-01 form "Propose species" (path without AI)', () => {
  const html = () =>
    renderToString(
      <ProposalForm
        start="Aloe"
        onSend={async () => null}
        onCancel={vi.fn()}
        onExisting={vi.fn()}
      />,
    );

  it("requires all required fields from DM-BES-01", () => {
    const h = html();
    for (const name of [
      "latinName",
      "difficulty",
      "standardLevel",
      "lightDemandLux",
      "growthMeasure",
      "etiolationSigns",
      "successCriteria",
    ])
      expect(h.split("<").find((tag) => tag.includes(`name="${name}"`))).toContain("required");
  });

  it("takes the search text as the name and explains visibility and review", () => {
    const h = html();
    expect(h).toContain('value="Aloe"');
    expect(h).toContain("nur für dich sichtbar");
    expect(h).toContain("Prüfliste");
  });

  it("optional details are collapsed and recognizable as optional; numbers have input aids", () => {
    const h = html();
    expect(h).toContain("Weitere Angaben (optional)");
    expect(h).toContain('inputMode="numeric"');
  });
});

describe("form to input and duplicate", () => {
  it("empty optional fields are dropped, numbers become numbers, synonyms one per line", () => {
    const f = new FormData();
    f.set("latinName", " Aloe vera ");
    f.set("difficulty", "2");
    f.set("lightDemandLux", "40000");
    f.set("germanName", "  ");
    f.set("synonyms", "Aloe barbadensis\n\n Aloe vulgaris ");
    expect(formToInput(f)).toEqual({
      latinName: "Aloe vera",
      difficulty: 2,
      lightDemandLux: 40000,
      synonyms: ["Aloe barbadensis", "Aloe vulgaris"],
    });
  });

  it("recognizes the duplicate in the error and returns the existing species", () => {
    const error = {
      code: "species.duplicate",
      text: "x",
      data: { existing: species },
    } as unknown as Parameters<typeof duplicate>[0];
    expect(duplicate(error)?.id).toBe("a1");
    expect(duplicate({ code: "input.invalid", text: "x" })).toBeNull();
  });
});
