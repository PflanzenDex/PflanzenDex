// @vitest-environment jsdom
import { cleanup, render as mount, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString as render } from "react-dom/server";
import type { Species } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { SpeciesProfile } from "./profile-view/profile-view";
import { ProposalForm } from "./proposal/proposal-form/proposal-form";
import { duplicate } from "./proposal/form";
import { SearchResultsSkeleton } from "./search-view/search-view.skeleton";
import { ProfileSkeleton } from "./profile-view/profile-view.skeleton";
import { proposalSchema, toProposalInput, EMPTY_PROPOSAL } from "./shared/schemas";

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

describe("US-BES-01 profile of a species (fields from DM-BES-01)", () => {
  it('shows the details; unknown means "unknown", nothing is invented (P-08)', () => {
    const h = renderToString(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Einfach");
    expect(h).toContain("15.000\u00a0Lux");
    expect(h).toContain("Höhe");
  });

  it("US-QS-21 the profile has a header with the primary action first and three tabs; known facts are a grid, unknown ones are named (P-08, P-10)", () => {
    const h = renderToString(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    expect(h.indexOf("Diese Art wählen")).toBeGreaterThan(h.indexOf("<header"));
    expect(h.indexOf("Diese Art wählen")).toBeLessThan(h.indexOf("Steckbrief</button>") + 400);
    for (const tab of ["Steckbrief", "Pflege", "Herkunft"]) expect(h).toContain(`>${tab}<`);
    expect(h).toContain("<dl");
    // Unknown stays unknown: counted in one line with the names behind it, no empty row each, nothing filled in.
    expect(h).toContain("3 Angaben fehlen");
    expect(h).toContain("Englischer Name, Ruhephase, Standort-Hinweis");
    expect(h).not.toMatch(/Englischer Name<\/dt>/);
  });

  it("US-QS-21 the care and origin tabs show their known facts and name the unknown ones", async () => {
    mount(<SpeciesProfile species={species} onChoose={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Pflege" }));
    expect(screen.getByText("Blätter kippen zur Seite.")).toBeTruthy();
    expect(screen.getByText("4 Angaben fehlen")).toBeTruthy();
    expect(screen.getByText("Gießhinweis, Substrat, Rückschnitt, Wuchs-Hacks")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Herkunft" }));
    expect(screen.getByText("Sansevieria trifasciata")).toBeTruthy();
    expect(screen.getByText("Botanische Story, Quelle")).toBeTruthy();
    cleanup();
  });

  it('US-BES-12 P-08: unknown difficulty, default level and lux need read "unbekannt", never a default (#1003)', () => {
    const h = renderToString(
      <SpeciesProfile
        species={{ ...species, difficulty: null, standardLevel: null, lightDemandLux: null }}
        onChoose={vi.fn()}
      />,
    );
    expect(h).toContain(
      "Englischer Name, Schwierigkeit, Standard-Stufe, Lichtbedarf, Ruhephase, Standort-Hinweis",
    );
    expect(h).not.toContain("Einfach");
  });

  it('US-BES-12 P-08: unknown growth measure, etiolation signs and success criteria read "unbekannt" (#1005)', () => {
    const h = renderToString(
      <SpeciesProfile
        species={{ ...species, growthMeasure: null, etiolationSigns: null, successCriteria: null }}
        onChoose={vi.fn()}
      />,
    );
    expect(h).toContain("Englischer Name, Ruhephase, Wachstumsmaß, Standort-Hinweis");
    // The care facts are on their own tab; opened there they are named as unknown too.
    mount(
      <SpeciesProfile
        species={{ ...species, growthMeasure: null, etiolationSigns: null, successCriteria: null }}
        onChoose={vi.fn()}
      />,
    );
    return userEvent.click(screen.getByRole("tab", { name: "Pflege" })).then(() => {
      expect(screen.getByText("6 Angaben fehlen")).toBeTruthy();
      expect(screen.getByText(/Vergeilung-Anzeichen, Erfolgskriterien/)).toBeTruthy();
      cleanup();
    });
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

describe('US-BES-01 form "Propose species" (path without AI)', () => {
  const html = () =>
    renderToString(<ProposalForm start="Aloe" onSend={async () => null} onExisting={vi.fn()} />);

  const light = () =>
    renderToString(
      <ProposalForm start="Aloe" onSend={async () => null} onExisting={vi.fn()} startStep={2} />,
    );

  it("US-BES-01 requires all required fields from DM-BES-01: the name and the growth on step 1, the two texts on step 2 (US-QS-21)", () => {
    const first = html();
    for (const name of ["latinName", "growthMeasure"])
      expect(first.split("<").find((tag) => tag.includes(`name="${name}"`))).toContain("required");
    const second = light();
    for (const name of ["etiolationSigns", "successCriteria"])
      expect(second.split("<").find((tag) => tag.includes(`name="${name}"`))).toContain("required");
  });

  it('US-BES-01 P-08: difficulty, default level and lux need are optional and offer "Unbekannt" (#1003)', () => {
    const h = light();
    for (const name of ["difficulty", "standardLevel", "lightDemandLux"])
      expect(h.split("<").find((tag) => tag.includes(`name="${name}"`))).not.toContain("required");
    expect(h).toContain("Unbekannt");
    expect(h).toContain("leer bleibt der Wert unbekannt");
  });

  it("takes the search text as the name and explains visibility and review", () => {
    const h = html();
    expect(h).toContain('value="Aloe"');
    expect(h).toContain("Nur für dich sichtbar");
    expect(h).toContain("Prüfliste");
  });

  it("US-QS-24 optional details are collapsed behind Mehr Angaben; numbers have input aids", () => {
    const h = light();
    expect(h).toContain("Mehr Angaben");
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
    expect(fields).toEqual(["latinName", "growthMeasure", "etiolationSigns", "successCriteria"]);
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
