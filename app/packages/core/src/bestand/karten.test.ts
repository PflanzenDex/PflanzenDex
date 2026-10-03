import { beforeEach, describe, expect, it } from "vitest";
import { LichtImSpeicher } from "../licht/testhilfe";
import { BehandlungenStub, MessungenStub } from "./karten-testhilfe";
import {
  KEINE_BEHANDLUNGEN,
  KEINE_MESSUNGEN,
  exemplarKarten,
  faelligkeit,
  type KartenAbhaengigkeiten,
} from "./index";
import { ArtenStub, ExemplareImSpeicher, testArt } from "./testhilfe";

const ART = "11111111-1111-4111-8111-111111111111";
const UNSICHTBAR = "99999999-9999-4999-8999-999999999999";
const HEUTE = "2026-10-03";
const licht = new LichtImSpeicher();
let exemplare: ExemplareImSpeicher;
let zone: string;
let regal: string;
let kiste: string;
let fremdRegal: string;

const arten = new ArtenStub([{ art: testArt(ART) }]);
const abhaengigkeiten = (extra: Partial<KartenAbhaengigkeiten> = {}): KartenAbhaengigkeiten => ({
  exemplare,
  arten,
  standorte: licht.standortAdapter(),
  zonen: licht.zonenAdapter(),
  messungen: KEINE_MESSUNGEN,
  behandlungen: KEINE_BEHANDLUNGEN,
  ...extra,
});
const lege = async (nutzerId: string, name: string, extra: Record<string, unknown> = {}) => {
  const r = await exemplare.anlegen(nutzerId, {
    artId: ART,
    name,
    kennzeichen: null,
    standortId: null,
    gefangenAm: "2026-09-01",
    ...extra,
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

beforeEach(async () => {
  licht.zonen.length = 0;
  licht.standorte.length = 0;
  const z = await licht.zonenAdapter().anlegen("anna", {
    name: "Zone 3",
    luxDecke: 30000,
    ppfd: null,
    reihenfolge: null,
  });
  zone = typeof z === "string" ? "" : z.id;
  const s = await licht
    .standortAdapter()
    .anlegen("anna", { name: "Regal Süd", lichtzoneId: zone, art: "innen" });
  regal = typeof s === "string" ? "" : s.id;
  const k = await licht
    .standortAdapter()
    .anlegen("anna", { name: "Kiste", lichtzoneId: null, art: "innen" });
  kiste = typeof k === "string" ? "" : k.id;
  const f = await licht
    .standortAdapter()
    .anlegen("ben", { name: "Fensterbank", lichtzoneId: null, art: "innen" });
  fremdRegal = typeof f === "string" ? "" : f.id;
  exemplare = new ExemplareImSpeicher({ anna: [regal, kiste], ben: [fremdRegal] });
});

describe("US-BES-06 Fälligkeit der offenen Behandlung", () => {
  it.each([
    ["2026-10-02", "überfällig seit 1 Tg.", "ueberfaellig", 1],
    ["2026-09-23", "überfällig seit 10 Tg.", "ueberfaellig", 10],
    ["2026-10-03", "heute fällig", "heute", 0],
    ["2026-10-04", "in 1 Tg.", "bald", 1],
    ["2026-10-20", "in 17 Tg.", "bald", 17],
  ] as const)("%s ergibt „%s“", (faellig, text, art, tage) => {
    expect(faelligkeit(faellig, HEUTE)).toEqual({ art, tage, text });
  });

  it("zählt Kalendertage über Monats-, Jahres- und Schaltjahrgrenzen", () => {
    expect(faelligkeit("2027-01-02", "2026-12-30").tage).toBe(3);
    expect(faelligkeit("2028-03-01", "2028-02-28").tage).toBe(2);
    expect(faelligkeit("2026-02-28", "2026-03-01")).toMatchObject({ art: "ueberfaellig", tage: 1 });
  });
});

describe("US-BES-06 Karte: Name, Art, Lichtzone, Status, Standort", () => {
  it("zeigt Name, Art, Status, Standort und die Lichtzone des Standorts", async () => {
    await lege("anna", "Bogenhanf", { standortId: regal });
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte).toMatchObject({
      name: "Bogenhanf",
      artName: "Bogenhanf",
      status: "pflanze",
      standort: "Regal Süd",
      lichtzone: "Zone 3",
      gefangenAm: "2026-09-01",
    });
  });

  it("ein Standort ohne Lichtzone und ein fehlender Standort bleiben „unbekannt“ (null), nichts wird erfunden", async () => {
    await lege("anna", "A", { standortId: kiste });
    await lege("anna", "B");
    const karten = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    const nach = (n: string) => karten.find((k) => k.name === n);
    expect(nach("A")).toMatchObject({ standort: "Kiste", lichtzone: null });
    expect(nach("B")).toMatchObject({ standort: null, lichtzone: null });
  });

  it("eine Art, die das Konto nicht (mehr) sehen darf, heißt „unbekannt“ (null)", async () => {
    await lege("anna", "Geist", { artId: UNSICHTBAR });
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte?.artName).toBeNull();
  });

  it("der deutsche Artname gilt, sonst der lateinische", async () => {
    const lat = "22222222-2222-4222-8222-222222222222";
    await lege("anna", "Aloe", { artId: lat });
    const deps = abhaengigkeiten({
      arten: new ArtenStub([
        { art: testArt(lat, { deutscherName: null, lateinischerName: "Aloe vera" }) },
      ]),
    });
    expect((await exemplarKarten(deps, "anna", HEUTE))[0]?.artName).toBe("Aloe vera");
  });
});

describe("US-BES-04 Karte: Steckling steht unter Stecklingslicht", () => {
  it("US-BES-04: ein Steckling zeigt die niedrigste Zone als Lichtzone, auch ohne Zone am Standort", async () => {
    await lege("anna", "Steckling", { standortId: kiste, status: "steckling" });
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte).toMatchObject({ status: "steckling", standort: "Kiste", lichtzone: "Zone 3" });
  });

  it("US-BES-04: ein Steckling an einem Standort höherer Zone zeigt trotzdem die niedrigste Zone", async () => {
    const hoch = await licht
      .zonenAdapter()
      .anlegen("anna", { name: "Zone 4", luxDecke: 50000, ppfd: null, reihenfolge: null });
    const zonenId = typeof hoch === "string" ? "" : hoch.id;
    const s = await licht
      .standortAdapter()
      .anlegen("anna", { name: "Oben", lichtzoneId: zonenId, art: "innen" });
    const oben = typeof s === "string" ? "" : s.id;
    exemplare = new ExemplareImSpeicher({ anna: [oben] });
    await lege("anna", "Steckling", { standortId: oben, status: "steckling" });
    await lege("anna", "Pflanze", { standortId: oben, status: "pflanze" });
    const karten = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karten.find((k) => k.name === "Steckling")?.lichtzone).toBe("Zone 3");
    expect(karten.find((k) => k.name === "Pflanze")?.lichtzone).toBe("Zone 4");
  });

  it("US-BES-04: ohne Zonen bleibt die Lichtzone des Stecklings unbekannt (P-08)", async () => {
    licht.zonen.length = 0;
    await lege("anna", "Steckling", { status: "steckling" });
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte?.lichtzone).toBeNull();
  });
});

describe("US-BES-06 Karte: letzte Messung und Foto", () => {
  it("ohne Messung: keine Messung, kein Foto (Platzhalter), nichts erfunden", async () => {
    await lege("anna", "Bogenhanf");
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte).toMatchObject({ letzteMessung: null, foto: null });
  });

  it("zeigt die letzte Messung mit Qualität, Datum und Notiz und das Foto der jüngsten Messung mit Foto", async () => {
    const e = await lege("anna", "Bogenhanf");
    const messungen = new MessungenStub({
      [e.id]: {
        letzte: { datum: "2026-10-01", qualitaet: "gesund", notiz: "Neues Blatt." },
        foto: { url: "/medien/alt.jpg", datum: "2026-09-20" },
      },
    });
    const [karte] = await exemplarKarten(abhaengigkeiten({ messungen }), "anna", HEUTE);
    expect(karte?.letzteMessung).toEqual({
      datum: "2026-10-01",
      qualitaet: "gesund",
      notiz: "Neues Blatt.",
    });
    expect(karte?.foto).toEqual({ url: "/medien/alt.jpg", datum: "2026-09-20" });
  });

  it("Vergeilt/dünn bleibt vergeilt und wird nie zu einem Erfolg umgedeutet (Vergeilung ist kein Erfolg)", async () => {
    const e = await lege("anna", "Bogenhanf");
    const messungen = new MessungenStub({
      [e.id]: {
        letzte: { datum: "2026-10-02", qualitaet: "vergeilt", notiz: null },
        foto: null,
      },
    });
    const [karte] = await exemplarKarten(abhaengigkeiten({ messungen }), "anna", HEUTE);
    expect(karte?.letzteMessung?.qualitaet).toBe("vergeilt");
  });

  it("fragt die Ports einmal für alle eigenen Exemplare, nie für fremde (Mandant, kein N+1)", async () => {
    const a1 = await lege("anna", "A1");
    const a2 = await lege("anna", "A2");
    const b = await lege("ben", "B1");
    const messungen = new MessungenStub({});
    const behandlungen = new BehandlungenStub({});
    await exemplarKarten(abhaengigkeiten({ messungen, behandlungen }), "anna", HEUTE);
    for (const stub of [messungen, behandlungen]) {
      expect(stub.aufrufe).toHaveLength(1);
      expect(stub.aufrufe[0]?.nutzerId).toBe("anna");
      expect([...(stub.aufrufe[0]?.ids ?? [])].sort()).toEqual([a1.id, a2.id].sort());
      expect(stub.aufrufe[0]?.ids).not.toContain(b.id);
    }
  });
});

describe("US-BES-06 Karte: offene Behandlung", () => {
  const behandlung = (id: string, grund: string, faelligAm: string) => ({ id, grund, faelligAm });

  it("ohne offene Behandlung: keine Behandlung, 0 weitere", async () => {
    await lege("anna", "Bogenhanf");
    const [karte] = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    expect(karte).toMatchObject({ behandlung: null, weitereBehandlungen: 0 });
  });

  it("zeigt Grund und Fälligkeit der einen offenen Behandlung", async () => {
    const e = await lege("anna", "Bogenhanf");
    const behandlungen = new BehandlungenStub({
      [e.id]: [behandlung("b1", "Wurzelfäule behandeln", "2026-09-30")],
    });
    const [karte] = await exemplarKarten(abhaengigkeiten({ behandlungen }), "anna", HEUTE);
    expect(karte?.behandlung).toEqual({
      grund: "Wurzelfäule behandeln",
      faelligkeit: { art: "ueberfaellig", tage: 3, text: "überfällig seit 3 Tg." },
    });
    expect(karte?.weitereBehandlungen).toBe(0);
  });

  it("bei mehreren zeigt sie die am frühesten fällige und zählt die übrigen als „+N weitere“", async () => {
    const e = await lege("anna", "Bogenhanf");
    const behandlungen = new BehandlungenStub({
      [e.id]: [
        behandlung("b1", "Umtopfen", "2026-10-10"),
        behandlung("b2", "Neem spritzen", "2026-10-03"),
        behandlung("b3", "Düngen", "2026-10-05"),
      ],
    });
    const [karte] = await exemplarKarten(abhaengigkeiten({ behandlungen }), "anna", HEUTE);
    expect(karte?.behandlung).toMatchObject({
      grund: "Neem spritzen",
      faelligkeit: { text: "heute fällig" },
    });
    expect(karte?.weitereBehandlungen).toBe(2);
  });
});

describe("US-BES-06 Mandant: nur eigene Exemplare", () => {
  it("ein Konto sieht nur Karten seiner Exemplare und keine Daten fremder Standorte", async () => {
    await lege("anna", "Annas Pflanze", { standortId: regal });
    await lege("ben", "Bens Pflanze", { standortId: fremdRegal });
    const annas = await exemplarKarten(abhaengigkeiten(), "anna", HEUTE);
    const bens = await exemplarKarten(abhaengigkeiten(), "ben", HEUTE);
    expect(annas.map((k) => k.name)).toEqual(["Annas Pflanze"]);
    expect(bens.map((k) => k.name)).toEqual(["Bens Pflanze"]);
    expect(bens[0]?.standort).toBe("Fensterbank");
    expect(JSON.stringify(bens)).not.toContain("Regal Süd");
    expect(await exemplarKarten(abhaengigkeiten(), "carla", HEUTE)).toEqual([]);
  });
});
