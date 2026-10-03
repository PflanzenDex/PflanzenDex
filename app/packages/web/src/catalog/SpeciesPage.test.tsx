// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesPage } from "./SpeciesPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  genus: "Dracaena",
  epithet: "trifasciata",
  cultivar: null,
  germanName: "Bogenhanf",
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "Blätter kippen.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Aufrecht.",
  botanicalStory: null,
  source: null,
  reviewStatus: "reviewed",
  createdBy: "user",
  own: false,
  version: 1,
} as Species;

function fakeServer(opts: { species?: unknown[]; proposal?: () => Promise<Response> } = {}) {
  const query: string[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    if (init?.method === "POST") return opts.proposal ? opts.proposal() : response(201, species);
    if (u.pathname === "/species") {
      query.push(u.searchParams.get("q") ?? "");
      return response(200, { species: opts.species ?? [] });
    }
    return response(200, species);
  });
  vi.stubGlobal("fetch", fetchFn);
  return { query };
}

const page = (extra: Partial<Parameters<typeof SpeciesPage>[0]> = {}) => (
  <SpeciesPage api="http://api" token={async () => "tok"} onChoose={vi.fn()} {...extra} />
);
const hit = { ...species, hit: null };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-01 Seite Arten", () => {
  it('empty catalog: says what to do and offers "Art vorschlagen" (P-09)', async () => {
    fakeServer();
    render(page());
    expect(
      await screen.findByText("Der gemeinsame Katalog ist noch leer. Schlage die erste Art vor."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Art vorschlagen" })).toBeTruthy();
  });

  it("searches after typing with the search text and opens the profile from which the species is chosen", async () => {
    const { query } = fakeServer({ species: [hit] });
    const onChoose = vi.fn();
    render(page({ onChoose }));
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Diese Art wählen" }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    expect(query[0]).toBe("");
  });

  it("the search passes the typed text to the API", async () => {
    const { query } = fakeServer({ species: [hit] });
    render(page());
    await userEvent.type(await screen.findByLabelText("Lateinischer oder deutscher Name"), "Bogen");
    await vi.waitFor(() => expect(query).toContain("Bogen"), { timeout: 2000 });
  });

  it("without sign-in the search shows the error text instead of an empty list (P-10)", async () => {
    fakeServer();
    render(page({ token: async () => undefined }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
  });

  it("a profile that cannot be loaded shows the error and the way back to the search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/species"
          ? response(200, { species: [hit] })
          : response(404, { error: { code: "species.not_found", text: "Art nicht gefunden." } }),
      ),
    );
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Art nicht gefunden.");
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Suche" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });

  it("a proposal lands in the review list: hint above the new profile", async () => {
    fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.type(screen.getByLabelText(/Lateinischer Name/), "Dracaena trifasciata");
    await userEvent.selectOptions(screen.getByLabelText(/Schwierigkeit/), "1");
    await userEvent.selectOptions(screen.getByLabelText(/Standard-Stufe/), "2");
    await userEvent.type(screen.getByLabelText(/Lichtbedarf/), "15000");
    await userEvent.selectOptions(screen.getByLabelText(/Wachstumsmaß/), "height");
    await userEvent.type(screen.getByLabelText(/Vergeilung-Anzeichen/), "Blätter kippen.");
    await userEvent.type(screen.getByLabelText(/Erfolgskriterien/), "Aufrecht.");
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    expect((await screen.findByRole("status")).textContent).toContain("liegt in der Prüfliste");
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Suche" }));
    expect(screen.queryByText(/liegt in der Prüfliste/)).toBeNull();
  });

  it("a duplicate offers the existing species and opens it", async () => {
    fakeServer({
      proposal: () =>
        response(409, {
          error: {
            code: "species.duplicate",
            text: "Diese Art gibt es schon.",
            details: [{ field: "latinName", code: "species.duplicate" }],
            data: { existing: species },
          },
        }),
    });
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.type(screen.getByLabelText(/Lateinischer Name/), "Dracaena trifasciata");
    await userEvent.selectOptions(screen.getByLabelText(/Schwierigkeit/), "1");
    await userEvent.selectOptions(screen.getByLabelText(/Standard-Stufe/), "2");
    await userEvent.type(screen.getByLabelText(/Lichtbedarf/), "15000");
    await userEvent.selectOptions(screen.getByLabelText(/Wachstumsmaß/), "height");
    await userEvent.type(screen.getByLabelText(/Vergeilung-Anzeichen/), "x");
    await userEvent.type(screen.getByLabelText(/Erfolgskriterien/), "y");
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Diese Art gibt es schon.");
    await userEvent.click(
      screen.getByRole("button", { name: "Vorhandene Art ansehen: Dracaena trifasciata" }),
    );
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
  });

  it("cancel in the proposal form leads back to the search", async () => {
    fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });
});
