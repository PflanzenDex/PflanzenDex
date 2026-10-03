import { describe, expect, it } from "vitest";
import { ArtenStub, ExemplareImSpeicher, testArt } from "../bestand/testhilfe";
import { pflegephase, pflegephasenListe } from "./index";

const WINTER = "11111111-1111-4111-8111-111111111111"; // Ruhephase 11-01 bis 03-15, über den Jahreswechsel
const SOMMER = "22222222-2222-4222-8222-222222222222"; // Ruhephase 06-01 bis 08-31, im selben Jahr
const OHNE = "33333333-3333-4333-8333-333333333333"; // ohne Ruhephasen-Zeitraum
const PRIVAT = "44444444-4444-4444-8444-444444444444";
const STANDORT = "55555555-5555-4555-8555-555555555555";

const arten = new ArtenStub([
  { art: testArt(WINTER, { deutscherName: "Bogenhanf", ruheVon: "11-01", ruheBis: "03-15" }) },
  { art: testArt(SOMMER, { deutscherName: "Aloe", ruheVon: "06-01", ruheBis: "08-31" }) },
  { art: testArt(OHNE, { deutscherName: "Efeutute" }) },
  {
    art: testArt(PRIVAT, { deutscherName: "Geheim", ruheVon: "11-01", ruheBis: "03-15" }),
    nur: "ben",
  },
]);

async function bestand(
  nutzerId: string,
  zeilen: { artId: string; name: string; standort?: string }[],
  status?: Record<string, "steckling" | "archiviert">,
) {
  const speicher = new ExemplareImSpeicher({ [nutzerId]: [STANDORT] });
  for (const z of zeilen)
    await speicher.anlegen(nutzerId, {
      artId: z.artId,
      name: z.name,
      kennzeichen: null,
      standortId: z.standort ?? null,
      gefangenAm: "2026-01-01",
    });
  for (const zeile of speicher.zeilen)
    if (status?.[zeile.name]) Object.assign(zeile, { status: status[zeile.name] });
  return speicher;
}

const liste = (
  exemplare: ExemplareImSpeicher,
  nutzerId: string,
  jetzt: string,
  zone: unknown = "UTC",
) => pflegephasenListe({ exemplare, arten, uhr: () => new Date(jetzt) }, nutzerId, zone);

describe("US-PHA-01 Phase eines Exemplars", () => {
  it("US-PHA-01 Zeitraum im selben Jahr: Ruhephase an Grenzen und dazwischen, sonst Wachstum", () => {
    expect(pflegephase("06-01", "08-31", "2026-06-01")).toBe("ruhe");
    expect(pflegephase("06-01", "08-31", "2026-07-15")).toBe("ruhe");
    expect(pflegephase("06-01", "08-31", "2026-08-31")).toBe("ruhe");
    expect(pflegephase("06-01", "08-31", "2026-05-31")).toBe("wachstum");
    expect(pflegephase("06-01", "08-31", "2026-09-01")).toBe("wachstum");
  });

  it("US-PHA-01 Zeitraum über den Jahreswechsel (11-01 bis 03-15)", () => {
    for (const tag of ["2026-11-01", "2026-12-31", "2027-01-01", "2027-03-15"])
      expect(pflegephase("11-01", "03-15", tag)).toBe("ruhe");
    for (const tag of ["2026-10-31", "2027-03-16", "2026-07-01"])
      expect(pflegephase("11-01", "03-15", tag)).toBe("wachstum");
  });

  it("US-PHA-01 listet nur aktive Exemplare, deren Art einen Ruhephasen-Zeitraum hat", async () => {
    const e = await bestand(
      "anna",
      [
        { artId: WINTER, name: "Bogenhanf" },
        { artId: OHNE, name: "Efeutute" },
        { artId: WINTER, name: "Steckling Bogenhanf" },
        { artId: SOMMER, name: "Aloe alt" },
      ],
      { "Steckling Bogenhanf": "steckling", "Aloe alt": "archiviert" },
    );
    const r = await liste(e, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.wert.map((z) => z.name)).toEqual(["Bogenhanf"]);
    expect(r.ok && r.wert[0]).toMatchObject({ phase: "ruhe", artId: WINTER });
  });

  it("US-PHA-01 die Phase folgt dem heutigen Datum in der Zeitzone des Nutzers, nicht dem UTC-Datum", async () => {
    const e = await bestand("anna", [{ artId: WINTER, name: "Bogenhanf" }]);
    // 2026-10-31 23:30 UTC: in UTC noch der 31.10. (Wachstum), in Berlin schon der 1.11. (Ruhe).
    const jetzt = "2026-10-31T23:30:00Z";
    const berlin = await liste(e, "anna", jetzt, "Europe/Berlin");
    const utc = await liste(e, "anna", jetzt, "UTC");
    expect(berlin.ok && berlin.wert[0]?.phase).toBe("ruhe");
    expect(utc.ok && utc.wert[0]?.phase).toBe("wachstum");
  });

  it("US-PHA-01 der Soll-Standort bleibt unbekannt, solange es kein Pflegeprofil gibt (P-08)", async () => {
    const e = await bestand("anna", [{ artId: WINTER, name: "Bogenhanf", standort: STANDORT }]);
    const r = await liste(e, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.wert[0]).toMatchObject({ standortId: STANDORT, sollStandortId: null });
  });

  it("US-PHA-01 fremde Exemplare und fremde private Arten bleiben unsichtbar (P-04)", async () => {
    const e = await bestand("ben", [{ artId: PRIVAT, name: "Geheim" }]);
    const fuerAnna = await liste(e, "anna", "2026-12-01T12:00:00Z");
    expect(fuerAnna.ok && fuerAnna.wert).toEqual([]);
    const fuerBen = await liste(e, "ben", "2026-12-01T12:00:00Z");
    expect(fuerBen.ok && fuerBen.wert).toHaveLength(1);
    // Annas Art-Sicht kennt die private Art nicht: ihr Exemplar derselben Kennung würde nicht gelistet.
    const anna = await bestand("anna", [{ artId: PRIVAT, name: "Geheim" }]);
    const r = await liste(anna, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.wert).toEqual([]);
  });

  it("US-PHA-01 eine ungültige Zeitzone schreibt und liest nichts und meldet eingabe.ungueltig", async () => {
    const e = await bestand("anna", [{ artId: WINTER, name: "Bogenhanf" }]);
    for (const zone of [null, "", "+02:00", "Nirgendwo/Stadt"]) {
      const r = await liste(e, "anna", "2026-12-01T12:00:00Z", zone);
      expect(r).toMatchObject({ ok: false, fehler: { code: "eingabe.ungueltig" } });
    }
  });
});
