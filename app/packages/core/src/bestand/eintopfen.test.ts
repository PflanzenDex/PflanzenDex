import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../kern";
import { SpeicherImSpeicher } from "../kern/testhilfe";
import { exemplarEintopfen } from "./index";
import { ExemplareImSpeicher } from "./testhilfe";

const ART = "11111111-1111-4111-8111-111111111111";
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };

let exemplare: ExemplareImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;

const eintopfen = (
  exemplarId: string,
  opt: { kontext?: { nutzerId: string | null }; schluessel?: string } = {},
) =>
  fuehreAus(
    exemplarEintopfen({ exemplare }),
    { idempotenz: idem },
    {
      kontext: opt.kontext ?? anna,
      eingabe: { exemplarId },
      idempotenzSchluessel: opt.schluessel ?? `k${++zaehler}`,
    },
  );

const lege = async (nutzerId: string, name: string, status: "pflanze" | "steckling") => {
  const r = await exemplare.anlegen(nutzerId, {
    artId: ART,
    name,
    kennzeichen: null,
    standortId: null,
    gefangenAm: "2026-09-01",
    status,
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

beforeEach(() => {
  exemplare = new ExemplareImSpeicher();
  idem = new SpeicherImSpeicher();
});

describe("US-BES-04 Eingetopft", () => {
  it("US-BES-04: ein Steckling wird eine Pflanze, alles andere bleibt unverändert", async () => {
    const steckling = await lege("anna", "Bogenhanf", "steckling");
    const r = await eintopfen(steckling.id);
    expect(r.ok && r.wert).toEqual({ ...steckling, status: "pflanze" });
  });

  it("US-BES-04: eine Pflanze ist kein Steckling, der Status bleibt und nichts wird geschrieben", async () => {
    const pflanze = await lege("anna", "Bogenhanf", "pflanze");
    const vorher = exemplare.schreibzugriffe;
    const r = await eintopfen(pflanze.id);
    expect(!r.ok && r.fehler.code).toBe("exemplar.kein_steckling");
    expect(exemplare.schreibzugriffe).toBe(vorher);
  });

  it("US-BES-04: ein archivierter Steckling wird nicht eingetopft", async () => {
    const steckling = await lege("anna", "Bogenhanf", "steckling");
    await exemplare.archivieren("anna", steckling.id, "abgegeben", "2026-10-01");
    const r = await eintopfen(steckling.id);
    expect(!r.ok && r.fehler.code).toBe("exemplar.kein_steckling");
    expect((await exemplare.finde("anna", steckling.id))?.status).toBe("archiviert");
  });

  it("US-BES-04: ein Steckling eines anderen Kontos sieht aus wie ein unbekannter (P-04)", async () => {
    const fremd = await lege("ben", "Bogenhanf", "steckling");
    const r = await eintopfen(fremd.id, { kontext: anna });
    expect(!r.ok && r.fehler.code).toBe("exemplar.nicht_gefunden");
    expect((await exemplare.finde("ben", fremd.id))?.status).toBe("steckling");
    const eigen = await eintopfen(fremd.id, { kontext: ben });
    expect(eigen.ok).toBe(true);
  });

  it("US-BES-04: eine unbekannte Kennung ist nicht gefunden, eine ungültige wird abgelehnt", async () => {
    const r = await eintopfen("00000000-0000-4000-8000-0000000000ff");
    expect(!r.ok && r.fehler.code).toBe("exemplar.nicht_gefunden");
    const ungueltig = await eintopfen("kaputt");
    expect(!ungueltig.ok && ungueltig.fehler.details).toEqual([
      { feld: "exemplarId", code: "eingabe.ungueltig" },
    ]);
  });

  it("US-BES-04: dieselbe Anfrage mit demselben Schlüssel wiederholt die erste Antwort (P-03)", async () => {
    const steckling = await lege("anna", "Bogenhanf", "steckling");
    const erste = await eintopfen(steckling.id, { schluessel: "gleich" });
    const vorher = exemplare.schreibzugriffe;
    const zweite = await eintopfen(steckling.id, { schluessel: "gleich" });
    expect(zweite).toEqual(erste);
    expect(exemplare.schreibzugriffe).toBe(vorher);
  });

  it("US-BES-04: ohne Anmeldung wird abgelehnt", async () => {
    const steckling = await lege("anna", "Bogenhanf", "steckling");
    const r = await eintopfen(steckling.id, { kontext: { nutzerId: null } });
    expect(r.ok).toBe(false);
    expect((await exemplare.finde("anna", steckling.id))?.status).toBe("steckling");
  });
});
