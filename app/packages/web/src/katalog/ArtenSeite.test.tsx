// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Art } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtenSeite } from "./ArtenSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const art = {
  id: "a1",
  lateinischerName: "Dracaena trifasciata",
  gattung: "Dracaena",
  epitheton: "trifasciata",
  sorte: null,
  deutscherName: "Bogenhanf",
  englischerName: null,
  synonyme: [],
  familieDeutsch: null,
  familieLateinisch: null,
  schwierigkeit: 1,
  standardStufe: 2,
  lichtbedarfLux: 15000,
  ruheVon: null,
  ruheBis: null,
  standortHinweis: null,
  wachstumsmass: "hoehe",
  vergeilungAnzeichen: "Blätter kippen.",
  giesshinweis: null,
  substrat: null,
  rueckschnitt: null,
  wuchsHacks: null,
  erfolgskriterien: "Aufrecht.",
  botanischeStory: null,
  quelle: null,
  pruefstatus: "geprueft",
  erstelltVon: "nutzer",
  eigener: false,
  version: 1,
} as Art;

function fakeServer(opts: { arten?: unknown[]; vorschlag?: () => Promise<Response> } = {}) {
  const abfragen: string[] = [];
  const abruf = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    if (init?.method === "POST") return opts.vorschlag ? opts.vorschlag() : antwort(201, art);
    if (u.pathname === "/arten") {
      abfragen.push(u.searchParams.get("q") ?? "");
      return antwort(200, { arten: opts.arten ?? [] });
    }
    return antwort(200, art);
  });
  vi.stubGlobal("fetch", abruf);
  return { abfragen };
}

const seite = (extra: Partial<Parameters<typeof ArtenSeite>[0]> = {}) => (
  <ArtenSeite api="http://api" token={async () => "tok"} onWaehlen={vi.fn()} {...extra} />
);
const treffer = { ...art, treffer: null };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-01 Seite Arten", () => {
  it("leerer Katalog: sagt, was zu tun ist, und bietet „Art vorschlagen“ an (P-09)", async () => {
    fakeServer();
    render(seite());
    expect(
      await screen.findByText("Der gemeinsame Katalog ist noch leer. Schlage die erste Art vor."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Art vorschlagen" })).toBeTruthy();
  });

  it("sucht nach dem Tippen mit dem Suchtext und öffnet das Profil, aus dem die Art gewählt wird", async () => {
    const { abfragen } = fakeServer({ arten: [treffer] });
    const onWaehlen = vi.fn();
    render(seite({ onWaehlen }));
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Diese Art wählen" }));
    expect(onWaehlen).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    expect(abfragen[0]).toBe("");
  });

  it("die Suche übergibt den getippten Text an die API", async () => {
    const { abfragen } = fakeServer({ arten: [treffer] });
    render(seite());
    await userEvent.type(await screen.findByLabelText("Lateinischer oder deutscher Name"), "Bogen");
    await vi.waitFor(() => expect(abfragen).toContain("Bogen"), { timeout: 2000 });
  });

  it("ohne Anmeldung zeigt die Suche den Fehlertext statt einer leeren Liste (P-10)", async () => {
    fakeServer();
    render(seite({ token: async () => undefined }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
  });

  it("ein nicht ladbares Profil zeigt den Fehler und den Weg zurück zur Suche", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/arten"
          ? antwort(200, { arten: [treffer] })
          : antwort(404, { fehler: { code: "art.nicht_gefunden", text: "Art nicht gefunden." } }),
      ),
    );
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Art nicht gefunden.");
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Suche" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });

  it("ein Vorschlag landet in der Prüfliste: Hinweis steht über dem neuen Profil", async () => {
    fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.type(screen.getByLabelText(/Lateinischer Name/), "Dracaena trifasciata");
    await userEvent.selectOptions(screen.getByLabelText(/Schwierigkeit/), "1");
    await userEvent.selectOptions(screen.getByLabelText(/Standard-Stufe/), "2");
    await userEvent.type(screen.getByLabelText(/Lichtbedarf/), "15000");
    await userEvent.selectOptions(screen.getByLabelText(/Wachstumsmaß/), "hoehe");
    await userEvent.type(screen.getByLabelText(/Vergeilung-Anzeichen/), "Blätter kippen.");
    await userEvent.type(screen.getByLabelText(/Erfolgskriterien/), "Aufrecht.");
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    expect((await screen.findByRole("status")).textContent).toContain("liegt in der Prüfliste");
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Suche" }));
    expect(screen.queryByText(/liegt in der Prüfliste/)).toBeNull();
  });

  it("eine Dublette bietet die vorhandene Art an und öffnet sie", async () => {
    fakeServer({
      vorschlag: () =>
        antwort(409, {
          fehler: {
            code: "art.dublette",
            text: "Diese Art gibt es schon.",
            details: [{ feld: "lateinischerName", code: "art.dublette" }],
            daten: { vorhandene: art },
          },
        }),
    });
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.type(screen.getByLabelText(/Lateinischer Name/), "Dracaena trifasciata");
    await userEvent.selectOptions(screen.getByLabelText(/Schwierigkeit/), "1");
    await userEvent.selectOptions(screen.getByLabelText(/Standard-Stufe/), "2");
    await userEvent.type(screen.getByLabelText(/Lichtbedarf/), "15000");
    await userEvent.selectOptions(screen.getByLabelText(/Wachstumsmaß/), "hoehe");
    await userEvent.type(screen.getByLabelText(/Vergeilung-Anzeichen/), "x");
    await userEvent.type(screen.getByLabelText(/Erfolgskriterien/), "y");
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Diese Art gibt es schon.");
    await userEvent.click(
      screen.getByRole("button", { name: "Vorhandene Art ansehen: Dracaena trifasciata" }),
    );
    expect(await screen.findByRole("heading", { name: "Dracaena trifasciata" })).toBeTruthy();
  });

  it("Abbrechen im Vorschlagsformular führt zurück zur Suche", async () => {
    fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });
});
