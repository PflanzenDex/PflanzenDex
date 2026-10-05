import { renderToString as render } from "react-dom/server";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { SpeciesProfile } from "./profile-view";
import { SpeciesSearch } from "./search-view";
import { ProposalForm } from "./proposal-form";
import { duplicate } from "./form";
import { SearchResultsSkeleton } from "./search-view.skeleton";
import { ProfileSkeleton } from "./profile-view.skeleton";
import { proposalSchema, toProposalInput, EMPTY_PROPOSAL } from "./schemas";

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
    expect(
      toProposalInput({
        ...EMPTY_PROPOSAL,
        latinName: " Aloe vera ",
        difficulty: "2",
        lightDemandLux: "40000",
        germanName: "  ",
        synonyms: "Aloe barbadensis\n\n Aloe vulgaris ",
      }),
    ).toEqual({
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

describe("US-BES-01 · DS-48 proposal schema", () => {
  const valid = {
    ...EMPTY_PROPOSAL,
    latinName: "Aloe vera",
    difficulty: "1",
    standardLevel: "3",
    lightDemandLux: "40000",
    growthMeasure: "height",
    etiolationSigns: "x",
    successCriteria: "y",
  };
  const issues = (over: Record<string, string>) => {
    const r = proposalSchema.safeParse({ ...valid, ...over });
    return r.success ? [] : r.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);
  };

  it("accepts the required fields alone", () => {
    expect(issues({})).toEqual([]);
  });

  it("names every missing required field in German", () => {
    const r = proposalSchema.safeParse(EMPTY_PROPOSAL);
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual([
      "latinName",
      "difficulty",
      "standardLevel",
      "lightDemandLux",
      "growthMeasure",
      "etiolationSigns",
      "successCriteria",
    ]);
  });

  it("the dormancy needs both dates or none, as MM-DD", () => {
    expect(issues({ dormancyFrom: "11-15" })).toEqual([
      "dormancyUntil: Beide Angaben zur Ruhephase gehören zusammen: Bitte gib auch das Ende an.",
    ]);
    expect(issues({ dormancyFrom: "11-15", dormancyUntil: "02-28" })).toEqual([]);
    expect(issues({ dormancyFrom: "1115", dormancyUntil: "02-28" })).toHaveLength(1);
  });

  it("the lux value is a whole number from 1 to 200000", () => {
    expect(issues({ lightDemandLux: "200001" })).toHaveLength(1);
    expect(issues({ lightDemandLux: "1.5" })).toHaveLength(1);
    expect(issues({ lightDemandLux: "200000" })).toEqual([]);
  });
});

describe("US-BES-01 · DS-48 skeletons", () => {
  it("each carries one loading status and no content", () => {
    const search = renderToString(<SearchResultsSkeleton />);
    const profile = renderToString(<ProfileSkeleton />);
    for (const h of [search, profile]) expect(h.match(/role="status"/g)).toHaveLength(1);
    expect(search).toContain("Suche läuft");
    expect(profile).toContain("Art wird geladen");
  });
});
