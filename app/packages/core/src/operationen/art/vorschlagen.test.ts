import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../operation";
import { SpeicherImSpeicher } from "../testhilfe";
import { artHinweise, artLaden, artSuchen, artVorschlagen } from "./index";
import { ArtImSpeicher } from "./testhilfe";

let speicher: ArtImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };

const profil = {
  lateinischerName: "Dracaena trifasciata",
  deutscherName: "Bogenhanf",
  synonyme: ["Sansevieria trifasciata"],
  schwierigkeit: 1,
  standardStufe: 2,
  lichtbedarfLux: 15000,
  wachstumsmass: "hoehe",
  vergeilungAnzeichen: "Blätter werden schmal und kippen zur Seite.",
  erfolgskriterien: "Neue Blätter wachsen aufrecht und kräftig gefärbt.",
};
const vorschlagen = (eingabe: unknown, kontext: { nutzerId: string | null } = anna) =>
  fuehreAus(
    artVorschlagen(speicher),
    { idempotenz: idem },
    { kontext, eingabe, idempotenzSchluessel: `k${++zaehler}` },
  );
const erste = () => speicher.zeilen[0]?.id ?? "";

beforeEach(() => {
  speicher = new ArtImSpeicher();
  idem = new SpeicherImSpeicher();
});

describe("US-BES-01 Art vorschlagen (Weg ohne KI, FR-KI-05)", () => {
  it("legt eine Art mit allen Pflichtfeldern als Vorschlag an, nur für den Ersteller sichtbar (FR-BES-11)", async () => {
    const r = await vorschlagen(profil);
    expect(r.ok && r.wert).toMatchObject({
      lateinischerName: "Dracaena trifasciata",
      gattung: "Dracaena",
      epitheton: "trifasciata",
      synonyme: ["Sansevieria trifasciata"],
      pruefstatus: "vorschlag",
      erstelltVon: "nutzer",
      eigener: true,
      ruheVon: null,
      giesshinweis: null,
    });
    expect((await artSuchen(speicher, "anna", "bogenhanf")).length).toBe(1);
    expect(await artSuchen(speicher, "ben", "bogenhanf")).toEqual([]);
    expect(await artLaden(speicher, "ben", erste())).toBeNull();
  });

  it.each([
    "lateinischerName",
    "schwierigkeit",
    "standardStufe",
    "lichtbedarfLux",
    "wachstumsmass",
    "vergeilungAnzeichen",
    "erfolgskriterien",
  ])("Pflichtfeld %s fehlt: abgelehnt, nichts geschrieben (P-03, FR-BES-05)", async (feld) => {
    const r = await vorschlagen({ ...profil, [feld]: undefined });
    expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    expect(!r.ok && r.fehler.details?.map((d) => d.feld)).toEqual([feld]);
    expect(speicher.zeilen).toHaveLength(0);
  });

  it("prüft Grenzen: Schwierigkeit 1 bis 3, Standard-Stufe 2 bis 4 (nie Stufe 1), Lux ganzzahlig", async () => {
    const abweichungen = [
      { schwierigkeit: 4 },
      { standardStufe: 1 },
      { lichtbedarfLux: 1.5 },
      { wachstumsmass: "gewicht" },
    ];
    for (const abweichung of abweichungen) {
      const r = await vorschlagen({ ...profil, ...abweichung });
      expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    }
    expect(speicher.zeilen).toHaveLength(0);
  });

  it("Ruhephase nur als Paar Monat-Tag, darf über den Jahreswechsel gehen; Ungültiges wird abgelehnt", async () => {
    const gut = await vorschlagen({ ...profil, ruheVon: "11-15", ruheBis: "02-28" });
    expect(gut.ok && gut.wert).toMatchObject({ ruheVon: "11-15", ruheBis: "02-28" });
    const schlecht = [
      ["11-15", undefined],
      ["13-01", "02-01"],
      ["02-30", "03-01"],
    ];
    for (const [ruheVon, ruheBis] of schlecht) {
      const r = await vorschlagen({ ...profil, lateinischerName: "Aloe vera", ruheVon, ruheBis });
      expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    }
  });

  it("unbekannte Werte bleiben unbekannt (null), es wird nichts erfunden (P-08)", async () => {
    const r = await vorschlagen(profil);
    expect(r.ok && r.wert).toMatchObject({
      englischerName: null,
      familieDeutsch: null,
      quelle: null,
      botanischeStory: null,
    });
  });

  it("eine Art ohne Epitheton (nur Gattung) ist erlaubt, zählt aber nicht als Pokédex-Fang (US-POK-06)", async () => {
    const r = await vorschlagen({ ...profil, lateinischerName: "Sansevieria", synonyme: [] });
    expect(r.ok && r.wert).toMatchObject({ gattung: "Sansevieria", epitheton: null });
    expect(
      r.ok &&
        artHinweise(r.wert)
          .map((h) => h.text)
          .join(" "),
    ).toContain("Gattung");
  });

  it("Dublette (gleicher normierter Name oder Synonym) wird erkannt und auf die vorhandene Art verwiesen (FR-BES-03)", async () => {
    const erstes = await vorschlagen(profil);
    const gleicher = await vorschlagen({ ...profil, lateinischerName: "dracaena  Trifasciata" });
    expect(!gleicher.ok && gleicher.fehler.code).toBe("art.dublette");
    expect(!gleicher.ok && gleicher.fehler.daten).toMatchObject({
      vorhandene: { id: erstes.ok && erstes.wert.id },
    });
    const name = "Sansevieria trifasciata";
    const ueberSynonym = await vorschlagen({ ...profil, lateinischerName: name, synonyme: [] });
    expect(!ueberSynonym.ok && ueberSynonym.fehler.code).toBe("art.dublette");
    expect(speicher.zeilen).toHaveLength(1);
  });

  it("private Vorschläge anderer sieht man nicht, also gibt es auch keine Dublette (P-04)", async () => {
    await vorschlagen(profil);
    expect((await vorschlagen(profil, ben)).ok).toBe(true);
  });

  it("derselbe Wiederholungsschutz-Schlüssel legt nichts doppelt an (AB-3)", async () => {
    const aufruf = { kontext: anna, eingabe: profil, idempotenzSchluessel: "gleich" };
    await fuehreAus(artVorschlagen(speicher), { idempotenz: idem }, aufruf);
    const zweiter = await fuehreAus(artVorschlagen(speicher), { idempotenz: idem }, aufruf);
    expect(zweiter.ok).toBe(true);
    expect(speicher.zeilen).toHaveLength(1);
  });

  it("ohne Anmeldung kein Vorschlag", async () => {
    const r = await vorschlagen(profil, { nutzerId: null });
    expect(!r.ok && r.fehler.code).toBe("zugriff.nicht_angemeldet");
  });
});

describe("US-BES-01 Suche nach lateinischem oder deutschem Namen und Synonymen", () => {
  beforeEach(async () => {
    await vorschlagen(profil);
    speicher.freigeben(erste());
  });

  it("findet die Art über lateinischen, deutschen Namen und Synonym und sagt, worüber (Sansevieria -> Dracaena)", async () => {
    const latein = await artSuchen(speicher, "ben", "DRACAENA triFasciata");
    const deutsch = await artSuchen(speicher, "ben", "Bogenhanf");
    const synonym = await artSuchen(speicher, "ben", "Sansevieria");
    expect(latein[0]?.treffer).toMatchObject({ feld: "lateinisch" });
    expect(deutsch[0]?.treffer).toMatchObject({ feld: "deutsch" });
    expect(synonym[0]).toMatchObject({
      lateinischerName: "Dracaena trifasciata",
      treffer: { feld: "synonym", anzeige: "Sansevieria trifasciata" },
    });
  });

  it("zeigt das Profil mit den Feldern aus DM-BES-01; Freigegebenes sehen alle", async () => {
    const art = await artLaden(speicher, "ben", erste());
    expect(art).toMatchObject({
      schwierigkeit: 1,
      standardStufe: 2,
      lichtbedarfLux: 15000,
      eigener: false,
    });
  });

  it("ohne Treffer: leere Liste; leere Suche listet alle sichtbaren", async () => {
    expect(await artSuchen(speicher, "ben", "Zzyzx")).toEqual([]);
    expect(await artSuchen(speicher, "ben", "  ")).toHaveLength(1);
  });
});

describe("Hinweise zu einer Art (P-09, FR-BES-11)", () => {
  it("ein Vorschlag nennt die nächste Handlung: Art prüfen lassen, dann zählt sie", async () => {
    const r = await vorschlagen(profil);
    expect(r.ok && artHinweise(r.wert)[0]).toMatchObject({
      text: expect.stringContaining("nur für dich sichtbar"),
      naechsteHandlung: expect.stringContaining("prüfen lassen"),
    });
  });
});

describe("US-BES-01 weitere Randfälle", () => {
  it.each([[["a"]], ["kein Array"], [Array.from({ length: 21 }, (_, i) => `Name ${i}x`)], [[5]]])(
    "ungültige Synonyme %j werden abgelehnt",
    async (synonyme) => {
      const r = await vorschlagen({ ...profil, synonyme });
      expect(!r.ok && r.fehler.details?.map((d) => d.feld)).toEqual(["synonyme"]);
    },
  );

  it("leere Synonyme und doppelte Namen zählen einmal", async () => {
    const r = await vorschlagen({
      ...profil,
      synonyme: ["Dracaena  trifasciata", "Dracaena trifasciata"],
    });
    expect(r.ok && r.wert.synonyme).toHaveLength(2);
  });

  it("eine ungültige Kennung ist keine Art, kein Serverfehler", async () => {
    expect(await artLaden(speicher, "anna", "kein-uuid")).toBeNull();
  });

  it("Hinweise: zurückgewiesen nennt die nächste Handlung, freigegeben mit Epitheton hat keine", async () => {
    const r = await vorschlagen(profil);
    if (!r.ok) throw new Error("Vorschlag fehlgeschlagen");
    expect(
      artHinweise({ ...r.wert, pruefstatus: "zurueckgewiesen" })[0]?.naechsteHandlung,
    ).toContain("erneut");
    expect(artHinweise({ ...r.wert, pruefstatus: "ki_ungeprueft" })).toHaveLength(1);
    expect(artHinweise({ ...r.wert, pruefstatus: "geprueft" })).toEqual([]);
  });
});
