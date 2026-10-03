import { readFileSync } from "node:fs";
import { renderToString as rendere } from "react-dom/server";
import type { ExemplarKarte } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { BestandListe } from "./bestand-liste";
import { ladeKarten } from "./karten-api";

// React trennt benachbarte Textteile beim Serverrendern mit Kommentaren; für Textprüfungen entfernen wir sie.
const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const karte = (extra: Partial<ExemplarKarte> = {}): ExemplarKarte => ({
  id: "e1",
  name: "Bogenhanf",
  artName: "Bogenhanf",
  status: "pflanze",
  standort: "Regal Süd",
  lichtzone: "Zone 3",
  gefangenAm: "2026-09-01",
  foto: null,
  letzteMessung: null,
  behandlung: null,
  weitereBehandlungen: 0,
  ...extra,
});
// Der sichtbare Text ohne Markup.
const sichtbar = (h: string) => h.replace(/<[^>]+>/g, "");
const html = (karten: ExemplarKarte[]) =>
  renderToString(<BestandListe karten={karten} onArtWaehlen={vi.fn()} />);

describe("US-BES-06 Client der Karten-API", () => {
  it("lädt die Karten mit Bearer-Token und der Zeitzone des Geräts", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { karten: [karte()] }));
    const r = await ladeKarten("http://api", "tok", abruf);
    expect(r).toMatchObject({ ok: true, wert: [{ id: "e1" }] });
    const [url, init] = abruf.mock.calls[0] ?? [];
    const zeitzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(String(url)).toBe(
      `http://api/exemplare/karten?zeitzone=${encodeURIComponent(zeitzone)}`,
    );
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("ein Serverfehler bleibt ein Fehler mit Code, keine leere Liste (P-10)", async () => {
    const fehler = { code: "eingabe.ungueltig", text: "Ungültig." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(400, { fehler }));
    expect(await ladeKarten("http://api", "tok", abruf)).toMatchObject({
      ok: false,
      fehler: { code: "eingabe.ungueltig" },
    });
  });
});

describe("US-BES-06 Karte: Inhalt", () => {
  it("zeigt Name, Art, Lichtzone, Status und Standort", () => {
    const h = html([karte()]);
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Art: Bogenhanf");
    expect(h).toContain("Lichtzone: Zone 3");
    expect(h).toContain("Status: Pflanze");
    expect(h).toContain("Standort: Regal Süd");
  });

  it("fehlende Werte heißen „unbekannt“, nichts wird erfunden (P-08)", () => {
    const h = html([karte({ artName: null, standort: null, lichtzone: null })]);
    expect(h).toContain("Art: unbekannt");
    expect(h).toContain("Lichtzone: unbekannt");
    expect(h).toContain("Standort: unbekannt");
  });

  it("zeigt die Stufen des Status in Worten", () => {
    expect(html([karte({ status: "steckling" })])).toContain("Status: Steckling");
    expect(html([karte({ status: "archiviert" })])).toContain("Status: Archiviert");
  });

  it("ohne Foto steht ein Platzhalter mit Text, nicht nur ein Bild", () => {
    const h = html([karte()]);
    expect(h).toContain("Noch kein Foto");
    expect(h).not.toContain("<img");
  });

  it("mit Foto: das Bild ist ein Link, der es groß öffnet, mit Beschreibung und Datum", () => {
    const h = html([karte({ foto: { url: "https://medien.test/x.jpg", datum: "2026-09-28" } })]);
    expect(h).toContain('href="https://medien.test/x.jpg"');
    expect(h).toContain("Foto von Bogenhanf groß öffnen");
    expect(h).toContain('alt="Foto von Bogenhanf vom 28.09.2026"');
    expect(h).not.toContain("Noch kein Foto");
  });
});

describe("US-BES-06 Karte: letzte Messung", () => {
  it("ohne Messung: „noch keine Messung“", () => {
    expect(html([karte()])).toContain("noch keine Messung");
  });

  it("zeigt Qualität und Datum der letzten Messung", () => {
    const h = html([
      karte({ letzteMessung: { datum: "2026-10-01", qualitaet: "gesund", notiz: null } }),
    ]);
    expect(sichtbar(h)).toContain("Letzte Messung: Gesund am 01.10.2026");
    expect(h).not.toContain("noch keine Messung");
  });

  it("Vergeilt/dünn ist nie ein Erfolg: Warnklasse, kein Erfolgswort, Hinweis auf die Erfolgskriterien", () => {
    const h = html([
      karte({ letzteMessung: { datum: "2026-10-01", qualitaet: "vergeilt", notiz: null } }),
    ]);
    expect(sichtbar(h)).toContain("Letzte Messung: Vergeilt/dünn am 01.10.2026");
    expect(h).toContain("kein Erfolgssignal");
    expect(h).toContain("qualitaet-vergeilt");
    expect(h).not.toContain("qualitaet-gesund");
  });

  it("die Notiz ist einklappbar (zu Beginn zu) und fehlt, wenn es keine gibt", () => {
    const mit = html([
      karte({ letzteMessung: { datum: "2026-10-01", qualitaet: "gesund", notiz: "Neues Blatt." } }),
    ]);
    expect(mit).toMatch(/<details(?![^>]*\sopen)[^>]*>\s*<summary[^>]*>Notiz/);
    expect(mit).toContain("Neues Blatt.");
    const ohne = html([
      karte({ letzteMessung: { datum: "2026-10-01", qualitaet: "gesund", notiz: null } }),
    ]);
    expect(ohne).not.toContain("<details");
  });
});

describe("US-BES-06 Karte: offene Behandlung", () => {
  const behandlung = (text: string, art: "ueberfaellig" | "heute" | "bald", tage: number) => ({
    grund: "Neem spritzen",
    faelligkeit: { art, tage, text },
  });

  it("ohne offene Behandlung: „keine offene Behandlung“", () => {
    expect(html([karte()])).toContain("keine offene Behandlung");
  });

  it("zeigt Grund und Fälligkeit, Überfälliges ist hervorgehoben", () => {
    const h = html([karte({ behandlung: behandlung("überfällig seit 3 Tg.", "ueberfaellig", 3) })]);
    expect(h).toContain("Neem spritzen");
    expect(h).toContain("überfällig seit 3 Tg.");
    expect(h).toContain("faellig-ueberfaellig");
    const heute = html([karte({ behandlung: behandlung("heute fällig", "heute", 0) })]);
    expect(heute).toContain("heute fällig");
    const bald = html([karte({ behandlung: behandlung("in 2 Tg.", "bald", 2) })]);
    expect(bald).toContain("in 2 Tg.");
    expect(bald).not.toContain("faellig-ueberfaellig");
  });

  it("bei mehreren steht „+N weitere“, bei einer nicht", () => {
    const b = behandlung("in 2 Tg.", "bald", 2);
    expect(html([karte({ behandlung: b, weitereBehandlungen: 2 })])).toContain("+2 weitere");
    expect(html([karte({ behandlung: b })])).not.toContain("weitere");
  });
});

describe("US-BES-06 Raster und Bedienung", () => {
  it("ein Raster aus Listeneinträgen, eine Karte je Exemplar, mit Überschrift je Karte", () => {
    const h = html([karte(), karte({ id: "e2", name: "Aloe" })]);
    expect(h.match(/<li class="exemplar-karte/g)).toHaveLength(2);
    expect(h).toContain('<ul class="karten-raster"');
    expect(h).toContain("<h3");
  });

  it("das Raster passt sich der Breite an: eine bis zwei Spalten auf dem Handy, mehr auf breiten Schirmen", () => {
    const css = readFileSync("src/bestand/bestand.css", "utf8");
    expect(css).toContain(".karten-raster");
    expect(css).toContain(
      "grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr))",
    );
  });

  it("ohne Exemplare: sagt, was zu tun ist (P-09), und bietet die Artwahl an", () => {
    const h = html([]);
    expect(h).toContain("Du hast noch kein Exemplar");
    expect(h).toContain("Art wählen");
  });

  it("der Knopf für ein weiteres Exemplar bleibt unter den Karten", () => {
    expect(html([karte()])).toContain("Weiteres Exemplar: Art wählen");
  });
});
