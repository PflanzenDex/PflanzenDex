import { renderToString as rendere } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LichtAnsicht, type LichtAktionen } from "./licht-ansicht";
import type { LichtDaten } from "./licht-api";
import { FehlerMeldung } from "./meldung";

// React trennt benachbarte Textteile beim Serverrendern mit Kommentaren; für Textprüfungen entfernen wir sie.
const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");
const nichts = async () => null;
const aktionen: LichtAktionen = {
  zoneAnlegen: nichts,
  zoneAendern: nichts,
  zoneLoeschen: nichts,
  voreinstellung: nichts,
  standortAnlegen: nichts,
  standortAendern: nichts,
};
const zone = { id: "z1", name: "Lampe 2", luxDecke: 15000, ppfd: 300, reihenfolge: 2 };
const leer: LichtDaten = { zonen: [], standorte: [], hinweise: [] };
const html = (daten: LichtDaten) =>
  renderToString(<LichtAnsicht daten={daten} aktionen={aktionen} />);

describe("US-LIC-05 Ansicht Standorte und Lichtzonen", () => {
  it("leeres Konto: sagt, was zu tun ist (P-09), und bietet die Voreinstellung an", () => {
    const h = html(leer);
    expect(h).toContain("Noch keine Lichtzonen");
    expect(h).toContain("Standard-Lampen übernehmen");
    expect(h).toContain("Noch keine Standorte");
  });

  it("zeigt Zone mit Lux-Decke, PPFD und Reihenfolge; fehlender PPFD heißt unbekannt (P-08)", () => {
    const h = html({ ...leer, zonen: [zone, { ...zone, id: "z2", name: "Lampe 9", ppfd: null }] });
    expect(h).toContain("bis 15.000 Lux");
    expect(h).toContain("PPFD 300 µmol/m²/s");
    expect(h).toContain("PPFD unbekannt");
  });

  it("zeigt Standort mit Zonenname und Art (außen/innen)", () => {
    const h = html({
      ...leer,
      zonen: [zone],
      standorte: [{ id: "s1", name: "Balkon", lichtzoneId: "z1", art: "aussen" }],
    });
    expect(h).toContain("Balkon");
    expect(h).toContain("Lampe 2 · außen");
  });

  it("Standort ohne Zone: erscheint in „Hinweise“ mit nächster Handlung und bietet Zuweisen an", () => {
    const h = html({
      zonen: [zone],
      standorte: [{ id: "s2", name: "Regal", lichtzoneId: null, art: "innen" }],
      hinweise: [
        {
          art: "standort_ohne_zone",
          standortId: "s2",
          text: "Der Standort „Regal“ hat noch keine Lichtzone.",
          naechsteHandlung: "Weise dem Standort eine Lichtzone zu.",
        },
      ],
    });
    expect(h).toContain("Hinweise");
    expect(h).toContain("Weise dem Standort eine Lichtzone zu.");
    expect(h).toContain("Keine Lichtzone");
    expect(h).toContain("Lichtzone zuweisen");
  });

  it("ohne betroffene Standorte gibt es keinen Hinweise-Block", () => {
    expect(html({ ...leer, zonen: [zone] })).not.toContain('id="hinweise"');
  });

  it("Formulare tragen sichtbare Beschriftungen und Eingabehilfen für Zahlen", () => {
    const h = html(leer);
    expect(h).toContain("Lux-Decke (Lux)");
    expect(h).toContain('inputMode="numeric"');
    expect(h).toContain("Keine Lichtzone (erscheint in den Hinweisen)");
  });
});

describe("US-LIC-05 Fehlermeldung beim Löschen einer genutzten Zone", () => {
  it("nennt die nutzenden Standorte, Exemplare und Arten (P-10)", () => {
    const h = renderToString(
      <FehlerMeldung
        fehler={{
          code: "lichtzone.in_benutzung",
          text: "Diese Lichtzone wird noch genutzt und kann nicht gelöscht werden.",
          daten: [
            { art: "standort", id: "s1", name: "Regal" },
            { art: "exemplar", id: "e1", name: "Monstera Nr. 1" },
            { art: "art", id: "a1", name: "Echinopsis" },
          ],
        }}
      />,
    );
    expect(h).toContain('role="alert"');
    expect(h).toContain("Standort: Regal");
    expect(h).toContain("Exemplar: Monstera Nr. 1");
    expect(h).toContain("Art: Echinopsis");
  });

  it("übersetzt beanstandete Felder in Worte", () => {
    const h = renderToString(
      <FehlerMeldung
        fehler={{
          code: "eingabe.ungueltig",
          text: "Die Eingabe ist ungültig.",
          details: [{ feld: "luxDecke", code: "eingabe.ungueltig" }],
        }}
      />,
    );
    expect(h).toContain("Bitte prüfe: Lux-Decke.");
  });
});
