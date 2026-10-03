import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../kern/operation";
import { SpeicherImSpeicher } from "../kern/testhilfe";
import { messAnsicht, messungErfassen } from "./index";
import { ExemplareStub, MessungenImSpeicher, artStub } from "./testhilfe";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const anna = { nutzerId: "anna" };
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober, in New York noch der 2. (NFR-08).
const JETZT = new Date("2026-10-02T23:30:00Z");

let messungen: MessungenImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;

const erfasse = (eingabe: unknown, kontext = anna, schluessel = `k${++zaehler}`) =>
  fuehreAus(
    messungErfassen({
      messungen,
      exemplare: new ExemplareStub({ anna: [E1], ben: [E2] }),
      uhr: () => JETZT,
    }),
    { idempotenz: idem },
    { kontext, eingabe, idempotenzSchluessel: schluessel },
  );
const eingabe = (extra: Record<string, unknown> = {}) => ({
  exemplarId: E1,
  zeitzone: "Europe/Berlin",
  wert: 12.5,
  ...extra,
});

beforeEach(() => {
  messungen = new MessungenImSpeicher({ anna: [E1], ben: [E2] });
  idem = new SpeicherImSpeicher();
});

describe("US-WAC-01 Messung erfassen: Eingabe", () => {
  it("speichert Zahl, Qualität und Notiz zum Exemplar", async () => {
    const r = await erfasse(
      eingabe({ wert: 14, qualitaet: "vergeilt", notiz: "  nach dem Umtopfen " }),
    );
    expect(r).toMatchObject({
      ok: true,
      wert: { exemplarId: E1, wert: 14, qualitaet: "vergeilt", notiz: "nach dem Umtopfen" },
    });
    expect(messungen.zeilen).toHaveLength(1);
  });

  it("ohne Qualität und Notiz: gesund und keine Notiz", async () => {
    const r = await erfasse(eingabe());
    expect(r).toMatchObject({ ok: true, wert: { qualitaet: "gesund", notiz: null } });
  });

  it.each([
    ["Text", "zwölf"],
    ["Zahl als Text", "12.5"],
    ["leer", undefined],
    ["negativ", -0.5],
    ["unendlich", Infinity],
    ["nicht im Schritt 0,5", 12.3],
    ["über der Grenze", 10_001],
  ])("lehnt eine ungültige Zahl ab (%s) und schreibt nichts", async (_, wert) => {
    const r = await erfasse(eingabe({ wert }));
    expect(r).toMatchObject({
      ok: false,
      fehler: { code: "eingabe.ungueltig", details: [{ feld: "wert" }] },
    });
    expect(messungen.schreibzugriffe).toBe(0);
  });

  it("lehnt eine unbekannte Qualität und eine leere Notiz ab, ohne zu schreiben", async () => {
    for (const extra of [{ qualitaet: "super" }, { notiz: "   " }]) {
      expect((await erfasse(eingabe(extra))).ok).toBe(false);
    }
    expect(messungen.schreibzugriffe).toBe(0);
  });

  it("nimmt 0 und das Raster 0,5 an", async () => {
    expect((await erfasse(eingabe({ wert: 0 }))).ok).toBe(true);
    expect((await erfasse(eingabe({ wert: 0.5 }))).ok).toBe(true);
  });
});

describe("US-WAC-01 Messung erfassen: Datum", () => {
  it("ist standardmäßig heute in der Zeitzone des Nutzers", async () => {
    const berlin = await erfasse(eingabe());
    const newYork = await erfasse(eingabe({ zeitzone: "America/New_York" }));
    expect(berlin).toMatchObject({ ok: true, wert: { datum: "2026-10-03" } });
    expect(newYork).toMatchObject({ ok: true, wert: { datum: "2026-10-02" } });
  });

  it("ist änderbar (Nachtragen), auch am selben Tag mehrfach (FR-WAC-07)", async () => {
    const a = await erfasse(eingabe({ datum: "2026-09-01" }));
    const b = await erfasse(eingabe({ datum: "2026-09-01", wert: 13 }));
    expect(a).toMatchObject({ ok: true, wert: { datum: "2026-09-01" } });
    expect(b.ok).toBe(true);
    expect(messungen.zeilen).toHaveLength(2);
  });

  it.each(["2026-02-30", "03.10.2026", "2026-13-01", "morgen", 20261003])(
    "lehnt das ungültige Datum %s ab, ohne zu schreiben",
    async (datum) => {
      const r = await erfasse(eingabe({ datum }));
      expect(r).toMatchObject({ ok: false, fehler: { code: "eingabe.ungueltig" } });
      expect(messungen.schreibzugriffe).toBe(0);
    },
  );

  it("lehnt ein Datum in der Zukunft ab (nach lokalem heute), heute selbst nicht", async () => {
    const morgen = await erfasse(eingabe({ datum: "2026-10-04" }));
    expect(morgen).toMatchObject({
      ok: false,
      fehler: { code: "eingabe.ungueltig", details: [{ feld: "datum" }] },
    });
    expect(messungen.schreibzugriffe).toBe(0);
    expect((await erfasse(eingabe({ datum: "2026-10-03" }))).ok).toBe(true);
    // In New York ist der 3. Oktober noch morgen.
    expect((await erfasse(eingabe({ datum: "2026-10-03", zeitzone: "America/New_York" }))).ok).toBe(
      false,
    );
  });
});

describe("US-WAC-01 Messung erfassen: Idempotenz (US-QS-03) und Mandant (P-04)", () => {
  it("derselbe Schlüssel schreibt nur einmal und liefert dasselbe Ergebnis", async () => {
    const a = await erfasse(eingabe(), anna, "gleich");
    const b = await erfasse(eingabe(), anna, "gleich");
    expect(messungen.zeilen).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it("derselbe Schlüssel mit anderer Eingabe ist ein Konflikt und schreibt nichts", async () => {
    await erfasse(eingabe(), anna, "gleich");
    const r = await erfasse(eingabe({ wert: 20 }), anna, "gleich");
    expect(r).toMatchObject({ ok: false, fehler: { code: "idempotenz.schluessel_konflikt" } });
    expect(messungen.zeilen).toHaveLength(1);
  });

  it("ohne Schlüssel und ohne Anmeldung wird nichts geschrieben", async () => {
    const op = messungErfassen({
      messungen,
      exemplare: new ExemplareStub({ anna: [E1] }),
      uhr: () => JETZT,
    });
    const ohneSchluessel = await fuehreAus(
      op,
      { idempotenz: idem },
      { kontext: anna, eingabe: eingabe(), idempotenzSchluessel: undefined },
    );
    const ohneAnmeldung = await fuehreAus(
      op,
      { idempotenz: idem },
      { kontext: { nutzerId: null }, eingabe: eingabe(), idempotenzSchluessel: "k" },
    );
    expect(ohneSchluessel).toMatchObject({
      ok: false,
      fehler: { code: "idempotenz.schluessel_fehlt" },
    });
    expect(ohneAnmeldung).toMatchObject({
      ok: false,
      fehler: { code: "zugriff.nicht_angemeldet" },
    });
    expect(messungen.schreibzugriffe).toBe(0);
  });

  it("ein fremdes oder unbekanntes Exemplar sieht gleich aus und bleibt unberührt", async () => {
    const fremd = await erfasse(eingabe({ exemplarId: E2 }), anna);
    const unbekannt = await erfasse(
      eingabe({ exemplarId: "00000000-0000-4000-8000-0000000000ff" }),
    );
    expect(fremd).toMatchObject({ ok: false, fehler: { code: "exemplar.nicht_gefunden" } });
    expect(unbekannt).toEqual(fremd);
    expect(messungen.schreibzugriffe).toBe(0);
  });
});

describe("US-WAC-01 Ansicht „Messen“", () => {
  const ansicht = (nutzer: string, id: string, mass: "hoehe" | null = "hoehe") =>
    messAnsicht(
      { messungen, exemplare: new ExemplareStub({ anna: [E1], ben: [E2] }), arten: artStub(mass) },
      nutzer,
      id,
    );

  it("ohne Messung: Was messen?, keine letzte Messung, keine Bewertung", async () => {
    expect(await ansicht("anna", E1)).toMatchObject({
      wachstumsmass: "hoehe",
      messungen: [],
      letzte: null,
      letzteBewertung: null,
    });
  });

  it("zeigt die letzte Messung nach Datum und deren Bewertung, auch bei Nachtrag", async () => {
    await erfasse(eingabe({ datum: "2026-10-01", wert: 20 }));
    await erfasse(eingabe({ datum: "2026-09-01", wert: 15, qualitaet: "vergeilt" }));
    const a = await ansicht("anna", E1);
    expect(a?.letzte).toMatchObject({ datum: "2026-10-01", wert: 20 });
    expect(a?.letzteBewertung).toBe("gesund");
    expect(a?.messungen.map((m) => m.wert)).toEqual([20, 15]);
  });

  it("nennt das Wachstumsmaß der Art; ist die Art nicht sichtbar, bleibt es unbekannt (P-08)", async () => {
    expect((await ansicht("anna", E1, null))?.wachstumsmass).toBeNull();
  });

  it("ein fremdes, unbekanntes oder ungültig geschriebenes Exemplar liefert nichts", async () => {
    await erfasse(eingabe());
    expect(await ansicht("ben", E1)).toBeNull();
    expect(await ansicht("anna", "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(await ansicht("anna", "kein-id")).toBeNull();
  });
});
