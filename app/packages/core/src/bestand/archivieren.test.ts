import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../kern";
import { SpeicherImSpeicher } from "../kern/testhilfe";
import { LichtImSpeicher } from "../licht/testhilfe";
import { BehandlungenStub, MessungenStub } from "./karten-testhilfe";
import {
  ARCHIV_GRUENDE,
  exemplarArchiv,
  exemplarArchivieren,
  exemplarKarten,
  exemplarLaden,
  exemplarWiederherstellen,
  exemplareListe,
} from "./index";
import { ArtenStub, ExemplareImSpeicher, testArt } from "./testhilfe";

// US-BES-07: Eingegangene oder abgegebene Pflanze archivieren, ohne die Historie zu verlieren.
const ART = "11111111-1111-4111-8111-111111111111";
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober, in New York noch der 2. (NFR-08)
const JETZT = new Date("2026-10-02T23:30:00Z");

let exemplare: ExemplareImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;
const arten = new ArtenStub([{ art: testArt(ART) }]);

const lege = async (nutzerId: string, name: string) => {
  const r = await exemplare.anlegen(nutzerId, {
    artId: ART,
    name,
    kennzeichen: null,
    standortId: null,
    gefangenAm: "2026-09-01",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};
const archivieren = (
  id: string,
  eingabe: Record<string, unknown> = {},
  kontext: { nutzerId: string | null } = anna,
) =>
  fuehreAus(
    exemplarArchivieren({ exemplare, uhr: () => JETZT }),
    { idempotenz: idem },
    {
      kontext,
      eingabe: { exemplarId: id, zeitzone: "Europe/Berlin", grund: "eingegangen", ...eingabe },
      idempotenzSchluessel: `k${++zaehler}`,
    },
  );
const wiederherstellen = (id: string, kontext: { nutzerId: string | null } = anna) =>
  fuehreAus(
    exemplarWiederherstellen({ exemplare }),
    { idempotenz: idem },
    { kontext, eingabe: { exemplarId: id }, idempotenzSchluessel: `k${++zaehler}` },
  );
const fehlerCode = (r: Awaited<ReturnType<typeof archivieren>>) => !r.ok && r.fehler.code;

beforeEach(() => {
  exemplare = new ExemplareImSpeicher();
  idem = new SpeicherImSpeicher();
});

describe("US-BES-07 Archivieren: Status, Datum und Grund", () => {
  it("setzt Status Archiviert, Archiviert_Am (lokales Datum) und Archiviert_Grund", async () => {
    const e = await lege("anna", "Bogenhanf");
    const r = await archivieren(e.id, { grund: "eingegangen" });
    expect(r.ok && r.wert).toMatchObject({
      id: e.id,
      status: "archiviert",
      archiviertAm: "2026-10-03",
      archiviertGrund: "eingegangen",
    });
    expect(exemplare.zeilen[0]).toMatchObject({ status: "archiviert", archiviertAm: "2026-10-03" });
  });

  it("US-BES-07, NFR-08: das Datum ist das lokale Kalenderdatum der Zeitzone, nicht UTC", async () => {
    const e = await lege("anna", "Bogenhanf");
    const r = await archivieren(e.id, { zeitzone: "America/New_York" });
    expect(r.ok && r.wert.archiviertAm).toBe("2026-10-02");
  });

  it.each([...ARCHIV_GRUENDE, "Gegen Nachbars Katze getauscht"])(
    "US-BES-07: der Grund „%s“ wird so gespeichert",
    async (grund) => {
      const e = await lege("anna", "Bogenhanf");
      const r = await archivieren(e.id, { grund });
      expect(r.ok && r.wert.archiviertGrund).toBe(grund);
    },
  );

  it("US-BES-07: der Grund wird von Leerraum befreit", async () => {
    const e = await lege("anna", "Bogenhanf");
    const r = await archivieren(e.id, { grund: "  verkauft  " });
    expect(r.ok && r.wert.archiviertGrund).toBe("verkauft");
  });

  it.each([
    ["ohne Grund", { grund: undefined }],
    ["mit leerem Grund", { grund: "   " }],
    ["mit zu langem Grund", { grund: "x".repeat(251) }],
    ["ohne Zeitzone", { zeitzone: undefined }],
    ["mit unbekannter Zeitzone", { zeitzone: "Mars/Olympus" }],
    ["mit ungültiger Kennung", { exemplarId: "topf" }],
  ])("US-BES-07: %s wird abgelehnt und schreibt nichts", async (_n, abweichung) => {
    const e = await lege("anna", "Bogenhanf");
    const vorher = exemplare.schreibzugriffe;
    const r = await archivieren(e.id, abweichung);
    expect(fehlerCode(r)).toBe("eingabe.ungueltig");
    expect(exemplare.schreibzugriffe).toBe(vorher);
    expect(exemplare.zeilen[0]?.status).toBe("pflanze");
  });

  it("US-BES-07: ein schon archiviertes Exemplar behält Datum und Grund der ersten Archivierung (P-10)", async () => {
    const e = await lege("anna", "Bogenhanf");
    await archivieren(e.id, { grund: "eingegangen" });
    const r = await archivieren(e.id, { grund: "verkauft", zeitzone: "America/New_York" });
    expect(fehlerCode(r)).toBe("exemplar.bereits_archiviert");
    expect(exemplare.zeilen[0]).toMatchObject({
      archiviertGrund: "eingegangen",
      archiviertAm: "2026-10-03",
    });
  });

  it("US-BES-07: ohne Anmeldung wird nichts archiviert", async () => {
    const e = await lege("anna", "Bogenhanf");
    const r = await archivieren(e.id, {}, { nutzerId: null });
    expect(fehlerCode(r)).toBe("zugriff.nicht_angemeldet");
    expect(exemplare.zeilen[0]?.status).toBe("pflanze");
  });
});

describe("US-BES-07 Mandantentrennung (P-04)", () => {
  it("ein fremdes Exemplar lässt sich nicht archivieren und sieht aus wie ein unbekanntes", async () => {
    const annas = await lege("anna", "Annas Topf");
    const fremd = await archivieren(annas.id, {}, ben);
    const unbekannt = await archivieren("99999999-9999-4999-8999-999999999999", {}, ben);
    expect(fehlerCode(fremd)).toBe("exemplar.nicht_gefunden");
    expect(!fremd.ok && !unbekannt.ok && fremd.fehler).toEqual(
      !unbekannt.ok ? unbekannt.fehler : null,
    );
    expect(exemplare.zeilen[0]).toMatchObject({ status: "pflanze", archiviertAm: null });
  });

  it("ein fremdes archiviertes Exemplar lässt sich nicht wiederherstellen", async () => {
    const annas = await lege("anna", "Annas Topf");
    await archivieren(annas.id);
    const r = await wiederherstellen(annas.id, ben);
    expect(fehlerCode(r)).toBe("exemplar.nicht_gefunden");
    expect(exemplare.zeilen[0]?.status).toBe("archiviert");
  });

  it("das Archiv zeigt nur die eigenen Exemplare", async () => {
    const annas = await lege("anna", "Annas Topf");
    const bens = await lege("ben", "Bens Topf");
    await archivieren(annas.id);
    await archivieren(bens.id, {}, ben);
    const eintraege = await exemplarArchiv({ exemplare, arten }, "anna");
    expect(eintraege.map((x) => x.name)).toEqual(["Annas Topf"]);
  });
});

describe("US-BES-07 Wiederherstellen", () => {
  it("stellt den Status von vorher wieder her und löscht Datum und Grund", async () => {
    const e = await lege("anna", "Bogenhanf");
    await archivieren(e.id);
    const r = await wiederherstellen(e.id);
    expect(r.ok && r.wert).toMatchObject({
      status: "pflanze",
      archiviertAm: null,
      archiviertGrund: null,
    });
  });

  it("ein Steckling bleibt nach dem Wiederherstellen ein Steckling", async () => {
    const e = await lege("anna", "Steckling");
    Object.assign(exemplare.zeilen[0] ?? {}, { status: "steckling" });
    await archivieren(e.id);
    const r = await wiederherstellen(e.id);
    expect(r.ok && r.wert.status).toBe("steckling");
  });

  it("ein Exemplar, das nicht archiviert ist, lässt sich nicht wiederherstellen", async () => {
    const e = await lege("anna", "Bogenhanf");
    expect(fehlerCode(await wiederherstellen(e.id))).toBe("exemplar.nicht_archiviert");
    expect(fehlerCode(await wiederherstellen("99999999-9999-4999-8999-999999999999"))).toBe(
      "exemplar.nicht_gefunden",
    );
  });
});

describe("US-BES-07 Archivierte Exemplare fehlen in Listen, bleiben aber einsehbar", () => {
  it("die Liste der Exemplare enthält kein archiviertes, das Wiederherstellen bringt es zurück", async () => {
    const weg = await lege("anna", "Weg");
    await lege("anna", "Da");
    await archivieren(weg.id);
    expect((await exemplareListe(exemplare, "anna")).map((x) => x.name)).toEqual(["Da"]);
    await wiederherstellen(weg.id);
    expect((await exemplareListe(exemplare, "anna")).map((x) => x.name)).toEqual(["Weg", "Da"]);
  });

  it("das einzelne Exemplar bleibt mit Historie ladbar (Datum und Grund sichtbar)", async () => {
    const e = await lege("anna", "Bogenhanf");
    await archivieren(e.id, { grund: "abgegeben" });
    expect(await exemplarLaden(exemplare, "anna", e.id)).toMatchObject({
      status: "archiviert",
      archiviertGrund: "abgegeben",
      gefangenAm: "2026-09-01",
    });
  });

  it("das Archiv nennt Name, Art, Datum und Grund, das zuletzt archivierte zuerst", async () => {
    const a = await lege("anna", "Alt");
    const b = await lege("anna", "Neu");
    await archivieren(a.id, { grund: "eingegangen", zeitzone: "America/New_York" });
    await archivieren(b.id, { grund: "verschenkt" });
    expect(await exemplarArchiv({ exemplare, arten }, "anna")).toEqual([
      {
        id: b.id,
        name: "Neu",
        artName: "Bogenhanf",
        gefangenAm: "2026-09-01",
        archiviertAm: "2026-10-03",
        archiviertGrund: "verschenkt",
      },
      expect.objectContaining({ id: a.id, archiviertAm: "2026-10-02" }),
    ]);
  });

  it("US-BES-06: Karten blenden archivierte Exemplare aus und fragen die Ports nicht nach ihnen", async () => {
    const weg = await lege("anna", "Weg");
    const da = await lege("anna", "Da");
    await archivieren(weg.id);
    const licht = new LichtImSpeicher();
    const messungen = new MessungenStub({});
    const behandlungen = new BehandlungenStub({});
    const karten = await exemplarKarten(
      {
        exemplare,
        arten,
        standorte: licht.standortAdapter(),
        zonen: licht.zonenAdapter(),
        messungen,
        behandlungen,
      },
      "anna",
      "2026-10-03",
    );
    expect(karten.map((k) => k.id)).toEqual([da.id]);
    expect(messungen.aufrufe[0]?.ids).toEqual([da.id]);
    expect(behandlungen.aufrufe[0]?.ids).toEqual([da.id]);
  });
});
