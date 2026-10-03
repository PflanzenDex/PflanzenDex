import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../kern";
import { SpeicherImSpeicher } from "../kern/testhilfe";
import { exemplarAnlegen, exemplarLaden, exemplareListe, KEIN_SOLL_STANDORT } from "./index";
import { ArtenStub, ExemplareImSpeicher, SollStandortStub, testArt } from "./testhilfe";

const ART = "11111111-1111-4111-8111-111111111111";
const ANDERE_ART = "22222222-2222-4222-8222-222222222222";
const PRIVAT = "33333333-3333-4333-8333-333333333333";
const STANDORT = "44444444-4444-4444-8444-444444444444";
const FREMD_STANDORT = "55555555-5555-4555-8555-555555555555";
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober, in New York noch der 2.
const JETZT = new Date("2026-10-02T23:30:00Z");

let exemplare: ExemplareImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;

const arten = new ArtenStub([
  { art: testArt(ART) },
  { art: testArt(ANDERE_ART, { deutscherName: null, lateinischerName: "Aloe vera" }) },
  { art: testArt(PRIVAT, { deutscherName: "Geheim" }), nur: "ben" },
]);

const anlegen = (
  eingabe: Record<string, unknown>,
  opt: { kontext?: { nutzerId: string | null }; soll?: SollStandortStub; schluessel?: string } = {},
) =>
  fuehreAus(
    exemplarAnlegen({
      exemplare,
      arten,
      sollStandort: opt.soll ?? KEIN_SOLL_STANDORT,
      uhr: () => JETZT,
    }),
    { idempotenz: idem },
    {
      kontext: opt.kontext ?? anna,
      eingabe: { artId: ART, zeitzone: "Europe/Berlin", ...eingabe },
      idempotenzSchluessel: opt.schluessel ?? `k${++zaehler}`,
    },
  );

beforeEach(() => {
  exemplare = new ExemplareImSpeicher({ anna: [STANDORT], ben: [FREMD_STANDORT] });
  idem = new SpeicherImSpeicher();
});

describe("US-BES-02 Exemplar anlegen: Pflicht und Vorbelegung", () => {
  it("Pflicht ist nur die Art; mit ihr entsteht ein Exemplar mit allen Vorbelegungen", async () => {
    const r = await anlegen({});
    expect(r.ok && r.wert).toMatchObject({
      artId: ART,
      name: "Bogenhanf",
      kennzeichen: null,
      status: "pflanze",
      standortId: null,
    });
    expect(exemplare.zeilen).toHaveLength(1);
  });

  it.each([
    ["ohne Art", { artId: undefined }],
    ["mit ungültiger Art-Kennung", { artId: "kaktus" }],
    ["ohne Zeitzone", { zeitzone: undefined }],
    ["mit unbekannter Zeitzone", { zeitzone: "Mars/Olympus" }],
    ["mit leerem Kennzeichen", { kennzeichen: "   " }],
    ["mit ungültigem Standort", { standortId: "regal" }],
  ])("%s: abgelehnt, nichts geschrieben (P-03)", async (_fall, eingabe) => {
    const r = await anlegen(eingabe);
    expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    expect(exemplare.schreibzugriffe).toBe(0);
  });

  it("eine Art, die es nicht gibt oder die das Konto nicht sehen darf, ist „nicht gefunden“ (P-04)", async () => {
    for (const artId of ["99999999-9999-4999-8999-999999999999", PRIVAT]) {
      const r = await anlegen({ artId });
      expect(!r.ok && r.fehler.code).toBe("art.nicht_gefunden");
    }
    expect(exemplare.schreibzugriffe).toBe(0);
    expect((await anlegen({ artId: PRIVAT }, { kontext: ben })).ok).toBe(true);
  });

  it("leere Messreihe und leere Behandlungsliste sind abgeleitet, nicht gespeichert", async () => {
    const r = await anlegen({});
    expect(r.ok && r.wert).toMatchObject({ messreihe: [], behandlungen: [] });
    const geladen = await exemplarLaden(exemplare, "anna", exemplare.zeilen[0]?.id ?? "");
    expect(geladen).toMatchObject({ messreihe: [], behandlungen: [] });
    expect(Object.keys(exemplare.zeilen[0] ?? {})).not.toContain("messreihe");
  });
});

describe("US-BES-02 Gefangen_Am ist das heutige lokale Datum (FR-BES-04, NFR-08)", () => {
  it("nach Mitternacht in Berlin, aber noch vor Mitternacht in UTC, gilt das Berliner Datum", async () => {
    const r = await anlegen({ zeitzone: "Europe/Berlin" });
    expect(r.ok && r.wert.gefangenAm).toBe("2026-10-03");
  });

  it("in New York ist es derselbe Zeitpunkt noch der Vortag", async () => {
    const r = await anlegen({ zeitzone: "America/New_York" });
    expect(r.ok && r.wert.gefangenAm).toBe("2026-10-02");
  });
});

describe("US-BES-02 Standort nach der heutigen Phase (Soll-Standort, FR-PHA-05)", () => {
  it("der Standort kommt vom Soll-Standort-Port; er erfährt Art und lokales Datum", async () => {
    const soll = new SollStandortStub(STANDORT);
    const r = await anlegen({}, { soll });
    expect(r.ok && r.wert.standortId).toBe(STANDORT);
    expect(soll.aufrufe).toEqual([{ nutzerId: "anna", artId: ART, heute: "2026-10-03" }]);
  });

  it("kennt niemand einen Soll-Standort, bleibt der Standort „unbekannt“ (null), er wird nicht erfunden (P-08)", async () => {
    const r = await anlegen({}, { soll: new SollStandortStub(null) });
    expect(r.ok && r.wert.standortId).toBeNull();
  });

  it("ein gewählter eigener Standort hat Vorrang vor dem Soll-Standort", async () => {
    const soll = new SollStandortStub(null);
    const r = await anlegen({ standortId: STANDORT }, { soll });
    expect(r.ok && r.wert.standortId).toBe(STANDORT);
    expect(soll.aufrufe).toEqual([]);
  });

  it("ein fremder oder unbekannter Standort wird abgelehnt, nichts geschrieben", async () => {
    const r = await anlegen({ standortId: FREMD_STANDORT });
    expect(!r.ok && r.fehler.code).toBe("standort.nicht_gefunden");
    expect(exemplare.zeilen).toHaveLength(0);
  });

  it("ein Soll-Standort, den es im Konto nicht (mehr) gibt, wird abgelehnt statt still verworfen (P-10)", async () => {
    const r = await anlegen({}, { soll: new SollStandortStub(FREMD_STANDORT) });
    expect(!r.ok && r.fehler.code).toBe("standort.nicht_gefunden");
    expect(exemplare.zeilen).toHaveLength(0);
  });
});

describe("US-BES-02 Der Name steht vor dem Speichern fest (DM-BES-03, FR-BES-03)", () => {
  it("existiert der Name schon, ändert sich nichts und der Fehler nennt die Namensregel", async () => {
    await anlegen({});
    const vorher = exemplare.zeilen.map((z) => ({ ...z }));
    const r = await anlegen({});
    expect(!r.ok && r.fehler.code).toBe("exemplar.name_vergeben");
    expect(!r.ok && r.fehler.daten).toMatchObject({
      name: "Bogenhanf",
      vorhandene: [{ name: "Bogenhanf" }],
    });
    expect(exemplare.zeilen).toEqual(vorher);
  });

  it("mit Kennzeichen entsteht „Art – Kennzeichen“, das erste Exemplar behält seinen Namen", async () => {
    await anlegen({});
    const r = await anlegen({ kennzeichen: "rot" });
    expect(r.ok && r.wert).toMatchObject({ name: "Bogenhanf – rot", kennzeichen: "rot" });
    expect(exemplare.zeilen.map((z) => z.name)).toEqual(["Bogenhanf", "Bogenhanf – rot"]);
  });

  it("dasselbe Kennzeichen ist je Art nicht doppelt erlaubt (Groß-/Kleinschreibung egal), ohne Änderung", async () => {
    await anlegen({ kennzeichen: "rot" });
    const r = await anlegen({ kennzeichen: "ROT" });
    expect(!r.ok && r.fehler.code).toBe("exemplar.name_vergeben");
    expect(exemplare.zeilen).toHaveLength(1);
  });

  it("der Name entsteht aus dem lateinischen Namen, wenn die Art keinen deutschen hat", async () => {
    const r = await anlegen({ artId: ANDERE_ART });
    expect(r.ok && r.wert.name).toBe("Aloe vera");
  });
});

describe("US-BES-02 Konto, Idempotenz und Anmeldung (P-03, P-04)", () => {
  it("jedes Konto hat seine eigenen Exemplare; derselbe Name bei einem anderen Konto ist erlaubt", async () => {
    await anlegen({});
    const b = await anlegen({}, { kontext: ben });
    expect(b.ok).toBe(true);
    expect(await exemplareListe(exemplare, "anna")).toHaveLength(1);
    const id = exemplare.zeilen[0]?.id ?? "";
    expect(await exemplarLaden(exemplare, "ben", id)).toBeNull();
    expect(await exemplarLaden(exemplare, "anna", id)).not.toBeNull();
  });

  it("derselbe Idempotency-Key legt nicht zweimal an und liefert dasselbe Ergebnis", async () => {
    const erst = await anlegen({}, { schluessel: "gleich" });
    const noch = await anlegen({}, { schluessel: "gleich" });
    expect(noch).toEqual(erst);
    expect(exemplare.zeilen).toHaveLength(1);
  });

  it("ohne Anmeldung: zugriff.nicht_angemeldet, nichts geschrieben", async () => {
    const r = await anlegen({}, { kontext: { nutzerId: null } });
    expect(!r.ok && r.fehler.code).toBe("zugriff.nicht_angemeldet");
    expect(exemplare.schreibzugriffe).toBe(0);
  });

  it("ein Exemplar-Laden mit ungültiger Kennung ist „nicht gefunden“ (null)", async () => {
    expect(await exemplarLaden(exemplare, "anna", "kaktus")).toBeNull();
  });
});

describe("US-BES-04 Steckling anlegen", () => {
  it("US-BES-04: ein Steckling bekommt den Standort der Wachstumsphase, nicht den Soll-Standort der Ruhephase", async () => {
    const soll = new SollStandortStub(FREMD_STANDORT, STANDORT);
    const r = await anlegen({ status: "steckling" }, { soll });
    expect(r.ok && r.wert).toMatchObject({ status: "steckling", standortId: STANDORT });
    expect(soll.wachstumsAufrufe).toEqual([{ nutzerId: "anna", artId: ART }]);
    expect(soll.aufrufe).toEqual([]);
  });

  it("US-BES-04: ein gewählter Standort geht dem Wachstums-Standort vor", async () => {
    const r = await anlegen(
      { status: "steckling", standortId: STANDORT },
      { soll: new SollStandortStub(null, "ignoriert") },
    );
    expect(r.ok && r.wert.standortId).toBe(STANDORT);
  });

  it("US-BES-04: ohne bekannten Wachstums-Standort bleibt der Standort des Stecklings unbekannt (P-08)", async () => {
    const r = await anlegen({ status: "steckling" });
    expect(r.ok && r.wert).toMatchObject({ status: "steckling", standortId: null });
  });

  it("US-BES-04: ohne Angabe oder mit „pflanze“ bleibt es eine Pflanze und der Soll-Standort gilt", async () => {
    for (const eingabe of [{}, { status: "pflanze" }]) {
      const soll = new SollStandortStub(STANDORT, "anderer");
      const r = await anlegen({ ...eingabe, kennzeichen: `k${++zaehler}` }, { soll });
      expect(r.ok && r.wert).toMatchObject({ status: "pflanze", standortId: STANDORT });
      expect(soll.wachstumsAufrufe).toEqual([]);
    }
  });

  it("US-BES-04: „archiviert“ und unbekannte Status werden beim Anlegen abgelehnt, nichts wird geschrieben", async () => {
    for (const status of ["archiviert", "tot", 3]) {
      const r = await anlegen({ status });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.fehler.details).toEqual([{ feld: "status", code: "eingabe.ungueltig" }]);
    }
    expect(exemplare.schreibzugriffe).toBe(0);
  });
});
