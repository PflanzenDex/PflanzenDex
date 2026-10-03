import { renderToString as rendere } from "react-dom/server";
import type { Art, Exemplar } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { legeExemplarAn } from "./exemplare-api";
import { AnlegenFormular } from "./anlegen-formular";
import { namenskonflikt } from "./text";

// React trennt benachbarte Textteile beim Serverrendern mit Kommentaren; für Textprüfungen entfernen wir sie.
const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const art = {
  id: "a1",
  lateinischerName: "Dracaena trifasciata",
  deutscherName: "Bogenhanf",
} as Art;
const standorte = [
  { id: "s1", name: "Regal Süd", lichtzoneId: null, art: "innen" as const },
  { id: "s2", name: "Balkon", lichtzoneId: null, art: "aussen" as const },
];
const exemplar = (extra: Partial<Exemplar> = {}): Exemplar => ({
  id: "e1",
  artId: "a1",
  name: "Bogenhanf",
  kennzeichen: null,
  standortId: null,
  status: "pflanze",
  gefangenAm: "2026-10-03",
  messreihe: [],
  behandlungen: [],
  ...extra,
});

describe("US-BES-02 Client der Exemplar-API", () => {
  it("legt mit Bearer-Token, Zeitzone des Geräts und frischem Idempotency-Key an", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(201, exemplar()));
    const r = await legeExemplarAn("http://api", "tok", { artId: "a1" }, abruf);
    expect(r).toMatchObject({ ok: true, wert: { name: "Bogenhanf" } });
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare");
    expect(init?.method).toBe("POST");
    const kopf = init?.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe("Bearer tok");
    expect(kopf["Idempotency-Key"]).toBeTruthy();
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body["artId"]).toBe("a1");
    expect(body["zeitzone"]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("ein vergebener Name bleibt ein Fehler mit Code und den vorhandenen Exemplaren", async () => {
    const fehler = {
      code: "exemplar.name_vergeben",
      text: "Gibt es schon.",
      daten: { name: "Bogenhanf", vorhandene: [{ id: "e1", name: "Bogenhanf" }] },
    };
    const abruf = vi.fn<typeof fetch>(async () => antwort(409, { fehler }));
    const r = await legeExemplarAn("http://api", "tok", { artId: "a1" }, abruf);
    expect(r).toMatchObject({ ok: false, fehler: { code: "exemplar.name_vergeben" } });
    expect(!r.ok && namenskonflikt(r.fehler)?.vorhandene).toEqual([
      { id: "e1", name: "Bogenhanf" },
    ]);
  });
});

describe("US-BES-02 Formular „Exemplar anlegen“", () => {
  const html = (extra: Partial<Parameters<typeof AnlegenFormular>[0]> = {}) =>
    renderToString(
      <AnlegenFormular
        art={art}
        standorte={standorte}
        onSenden={async () => null}
        onAbbrechen={vi.fn()}
        {...extra}
      />,
    );

  it("zeigt die gewählte Art und den Namen, der vor dem Speichern feststeht", () => {
    const h = html();
    expect(h).toContain("Exemplar anlegen");
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Name: Bogenhanf");
  });

  it("nur die Art ist Pflicht: Standort und Kennzeichen sind frei, Standort lässt sich aus den eigenen wählen", () => {
    const h = html();
    expect(h).toContain("Standort noch unbekannt");
    expect(h).toContain("Regal Süd");
    expect(h).toContain("Balkon");
    expect(h).toContain("Kennzeichen (optional)");
    expect(h.split("<").filter((t) => t.includes("required"))).toEqual([]);
  });

  it("erklärt Gefangen_Am (heute, lokales Datum) und nennt keinen erfundenen Standort", () => {
    const h = html();
    expect(h).toContain("Gefangen am: heute");
    expect(h).toContain("Ohne Auswahl bleibt der Standort unbekannt");
  });

  it("bei vergebenem Namen: Fehler mit den vorhandenen Exemplaren und der Aufforderung zum Kennzeichen (P-09)", () => {
    const fehler = {
      code: "exemplar.name_vergeben",
      text: "Ein Exemplar mit diesem Namen gibt es schon. Gib ein Kennzeichen an (zum Beispiel eine Farbe).",
      daten: { name: "Bogenhanf", vorhandene: [{ id: "e1", name: "Bogenhanf" }] },
    } as unknown as Parameters<typeof namenskonflikt>[0];
    const h = html({ fehlerStart: fehler });
    expect(h).toContain("Ein Exemplar mit diesem Namen gibt es schon. Gib ein Kennzeichen an");
    expect(h).toContain("Schon vorhanden: Bogenhanf");
    expect(h).toContain("heißt das neue Exemplar dann „Bogenhanf – Kennzeichen“");
  });
});
