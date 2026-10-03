import { renderToString as rendere } from "react-dom/server";
import type { Art, ArtTreffer } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { ArtProfil } from "./profil-ansicht";
import { ArtSuche } from "./suche-ansicht";
import { VorschlagFormular } from "./vorschlag-formular";
import { dublette, formularZuEingabe } from "./formular";

// React trennt benachbarte Textteile beim Serverrendern mit Kommentaren; für Textprüfungen entfernen wir sie.
const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");

const art: Art = {
  id: "a1",
  lateinischerName: "Dracaena trifasciata",
  gattung: "Dracaena",
  epitheton: "trifasciata",
  sorte: null,
  deutscherName: "Bogenhanf",
  englischerName: null,
  synonyme: ["Sansevieria trifasciata"],
  familieDeutsch: null,
  familieLateinisch: "Asparagaceae",
  schwierigkeit: 1,
  standardStufe: 2,
  lichtbedarfLux: 15000,
  ruheVon: null,
  ruheBis: null,
  standortHinweis: null,
  wachstumsmass: "hoehe",
  vergeilungAnzeichen: "Blätter kippen zur Seite.",
  giesshinweis: null,
  substrat: null,
  rueckschnitt: null,
  wuchsHacks: null,
  erfolgskriterien: "Aufrechte Blätter.",
  botanischeStory: null,
  quelle: null,
  pruefstatus: "geprueft",
  erstelltVon: "nutzer",
  eigener: false,
  version: 1,
};
const treffer = (a: Art, t: ArtTreffer["treffer"] = null): ArtTreffer => ({ ...a, treffer: t });

describe("US-BES-01 Profil einer Art (Felder aus DM-BES-01)", () => {
  it("zeigt die Angaben; Unbekanntes heißt „unbekannt“, nichts wird erfunden (P-08)", () => {
    const h = renderToString(<ArtProfil art={art} onWaehlen={vi.fn()} />);
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

  it("freigegebene Art: gekennzeichnet als geprüft, mit Knopf zum Wählen", () => {
    const h = renderToString(<ArtProfil art={art} onWaehlen={vi.fn()} />);
    expect(h).toContain("Geprüft");
    expect(h).toContain("Diese Art wählen");
  });

  it("Vorschlag: nur für den Ersteller sichtbar, sagt was als Nächstes zu tun ist (P-09, FR-BES-11)", () => {
    const h = renderToString(
      <ArtProfil art={{ ...art, pruefstatus: "vorschlag", eigener: true }} onWaehlen={vi.fn()} />,
    );
    expect(h).toContain("Vorschlag");
    expect(h).toContain("nur für dich sichtbar");
    expect(h).toContain("Art prüfen lassen, dann zählt sie.");
    expect(h).toContain("Diese Art wählen");
  });

  it("nur Gattung: erlaubt, aber ohne Pokédex-Fang", () => {
    const h = renderToString(<ArtProfil art={{ ...art, epitheton: null }} onWaehlen={vi.fn()} />);
    expect(h).toContain("zählt nicht als Pokédex-Fang");
  });
});

describe("US-BES-01 Suche", () => {
  const aktionen = { onSuche: vi.fn(), onOeffnen: vi.fn(), onVorschlagen: vi.fn() };

  it("das Suchfeld hat eine Beschriftung und sucht nach lateinischem oder deutschem Namen", () => {
    const h = renderToString(<ArtSuche suchtext="" treffer={[]} {...aktionen} />);
    expect(h).toContain("Lateinischer oder deutscher Name");
    expect(h).toContain('type="search"');
  });

  it("nennt bei einem Treffer über Synonym, worüber die Art gefunden wurde (Sansevieria -> Dracaena)", () => {
    const h = renderToString(
      <ArtSuche
        suchtext="sansevieria"
        treffer={[treffer(art, { feld: "synonym", anzeige: "Sansevieria trifasciata" })]}
        {...aktionen}
      />,
    );
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Gefunden über Synonym: Sansevieria trifasciata");
  });

  it("kennzeichnet eigene Vorschläge in der Liste", () => {
    const h = renderToString(
      <ArtSuche
        suchtext=""
        treffer={[treffer({ ...art, pruefstatus: "vorschlag", eigener: true })]}
        {...aktionen}
      />,
    );
    expect(h).toContain("Vorschlag, nur für dich sichtbar");
  });

  it("ohne Treffer: bietet „Art vorschlagen“ an (P-09)", () => {
    const h = renderToString(<ArtSuche suchtext="Zzyzx" treffer={[]} {...aktionen} />);
    expect(h).toContain("Keine Art zu „Zzyzx“ gefunden");
    expect(h).toContain("Art vorschlagen");
  });
});

describe("US-BES-01 Formular „Art vorschlagen“ (Weg ohne KI)", () => {
  const html = () =>
    renderToString(
      <VorschlagFormular
        start="Aloe"
        onSenden={async () => null}
        onAbbrechen={vi.fn()}
        onVorhandene={vi.fn()}
      />,
    );

  it("verlangt alle Pflichtfelder aus DM-BES-01", () => {
    const h = html();
    for (const name of [
      "lateinischerName",
      "schwierigkeit",
      "standardStufe",
      "lichtbedarfLux",
      "wachstumsmass",
      "vergeilungAnzeichen",
      "erfolgskriterien",
    ])
      expect(h).toMatch(new RegExp(`name="${name}"[^>]*required|required=""[^>]*name="${name}"`));
  });

  it("übernimmt den Suchtext als Namen und erklärt Sichtbarkeit und Prüfung", () => {
    const h = html();
    expect(h).toContain('value="Aloe"');
    expect(h).toContain("nur für dich sichtbar");
    expect(h).toContain("Prüfliste");
  });

  it("optionale Angaben sind eingeklappt und als optional erkennbar; Zahlen haben Eingabehilfen", () => {
    const h = html();
    expect(h).toContain("Weitere Angaben (optional)");
    expect(h).toContain('inputMode="numeric"');
  });
});

describe("Formular zu Eingabe und Dublette", () => {
  it("leere optionale Felder entfallen, Zahlen werden Zahlen, Synonyme je Zeile", () => {
    const f = new FormData();
    f.set("lateinischerName", " Aloe vera ");
    f.set("schwierigkeit", "2");
    f.set("lichtbedarfLux", "40000");
    f.set("deutscherName", "  ");
    f.set("synonyme", "Aloe barbadensis\n\n Aloe vulgaris ");
    expect(formularZuEingabe(f)).toEqual({
      lateinischerName: "Aloe vera",
      schwierigkeit: 2,
      lichtbedarfLux: 40000,
      synonyme: ["Aloe barbadensis", "Aloe vulgaris"],
    });
  });

  it("erkennt die Dublette im Fehler und liefert die vorhandene Art", () => {
    const fehler = {
      code: "art.dublette",
      text: "x",
      daten: { vorhandene: art },
    } as unknown as Parameters<typeof dublette>[0];
    expect(dublette(fehler)?.id).toBe("a1");
    expect(dublette({ code: "eingabe.ungueltig", text: "x" })).toBeNull();
  });
});
