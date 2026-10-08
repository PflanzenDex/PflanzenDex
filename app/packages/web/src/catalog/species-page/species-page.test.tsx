// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS, type Species } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesPage } from "./species-page";

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
    expect(await screen.findByText("Der gemeinsame Katalog ist noch leer.")).toBeTruthy();
    expect(screen.getByText("Schlage die erste Art vor.")).toBeTruthy();
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
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["access.not_signed_in"],
    );
  });

  it("US-BES-01 · DS-48 a failed search offers to try again and then lists the hits (DS-26, P-09)", async () => {
    let failing = true;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        failing
          ? response(500, { error: { code: "input.invalid", text: "roher Servertext" } })
          : response(200, { species: [hit] }),
      ),
    );
    render(page());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("roher Servertext");
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("button", { name: /Dracaena trifasciata/ })).toBeTruthy();
  });

  it("US-BES-01 · DS-48 the search shows a skeleton with one status while it loads", async () => {
    fakeServer({ species: [hit] });
    render(page());
    expect(screen.getByRole("status").textContent).toContain("Suche läuft");
    expect(await screen.findByRole("button", { name: /Dracaena trifasciata/ })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
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
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["species.not_found"],
    );
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
    const message = await screen.findByRole("alert");
    expect(message.textContent).toContain(ERROR_TEXTS["species.duplicate"]);
    const name = screen.getByLabelText(/Lateinischer Name/);
    expect(name.getAttribute("aria-describedby")).toContain(message.id);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await userEvent.click(
      screen.getByRole("button", { name: "Vorhandene Art ansehen: Dracaena trifasciata" }),
    );
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
  });

  it("US-BES-01 · DS-48 an invalid submission focuses the first invalid field and links its German message", async () => {
    fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    const name = screen.getByLabelText(/Lateinischer Name/);
    await vi.waitFor(() => expect(document.activeElement).toBe(name));
    const message = screen.getByText("Bitte gib den lateinischen Namen an.");
    expect(name.getAttribute("aria-describedby")).toContain(message.id);
    expect(screen.getByLabelText(/Schwierigkeit/).getAttribute("aria-invalid")).toBe("true");
  });

  it("US-BES-01 · DS-48 a lux value outside the allowed range is refused before sending", async () => {
    fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.type(screen.getByLabelText(/Lichtbedarf/), "0");
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    expect(await screen.findByText(/ganze Zahl zwischen 1 und 200.000/)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("cancel in the proposal form leads back to the search", async () => {
    fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });
});

describe("US-POK-09 open a species profile from outside", () => {
  it("US-POK-09 with openId the page starts on the profile of that species", async () => {
    fakeServer();
    render(page({ openId: "a1" }));
    expect(await screen.findByText(/Bogenhanf/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Zurück zur Suche/ })).toBeTruthy();
  });
});

describe("US-QS-14 · US-BES-09 a section of another module below the profile", () => {
  it("US-QS-14 the section the app hands over shows below the profile of the species, with the species", async () => {
    fakeServer();
    render(
      page({
        openId: "a1",
        profileSection: (s) => <h2>{`Mein Pflegeprofil von ${s.germanName}`}</h2>,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Mein Pflegeprofil von Bogenhanf" }),
    ).toBeTruthy();
  });
});
