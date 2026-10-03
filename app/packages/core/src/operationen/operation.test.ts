import { beforeEach, describe, expect, it } from "vitest";
import type { Kontext } from "./index";
import {
  definiereOperation,
  fehlgeschlagen,
  fehler,
  fuehreAus,
  objekt,
  ok,
  standortAnlegen,
  textFeld,
} from "./index";
import { SpeicherImSpeicher, StandorteImSpeicher } from "./testhilfe";

let idem: SpeicherImSpeicher;
let standorte: StandorteImSpeicher;
const nutzer = { nutzerId: "u1" };

const rufe = (eingabe: unknown, schluessel: string | undefined = "k1", kontext: Kontext = nutzer) =>
  fuehreAus(
    standortAnlegen(standorte),
    { idempotenz: idem },
    { kontext, eingabe, idempotenzSchluessel: schluessel },
  );

beforeEach(() => {
  idem = new SpeicherImSpeicher();
  standorte = new StandorteImSpeicher();
});

describe("US-QS-03 / FR-KI-02 Operationen: Idempotenz", () => {
  it("legt bei gültiger Eingabe genau einen Eintrag an", async () => {
    const r = await rufe({ name: "  Fensterbank " });
    expect(r.ok && r.wert.name).toBe("Fensterbank");
    expect(standorte.zeilen).toHaveLength(1);
  });

  it("Doppelaufruf mit gleichem Schlüssel erzeugt keinen Doppeleintrag und liefert dasselbe Ergebnis", async () => {
    const erst = await rufe({ name: "Fensterbank" });
    const zweit = await rufe({ name: "Fensterbank" });
    expect(zweit).toEqual(erst);
    expect(standorte.zeilen).toHaveLength(1);
    expect(standorte.schreibzugriffe).toBe(1);
  });

  it("gleicher Schlüssel, andere Eingabe: idempotenz.schluessel_konflikt, nichts geschrieben", async () => {
    await rufe({ name: "A" });
    const r = await rufe({ name: "B" });
    expect(!r.ok && r.fehler.code).toBe("idempotenz.schluessel_konflikt");
    expect(standorte.zeilen).toHaveLength(1);
  });

  it("Schlüssel ist je Nutzer getrennt (P-04)", async () => {
    await rufe({ name: "A" });
    const r = await rufe({ name: "A" }, "k1", { nutzerId: "u2" });
    expect(r.ok).toBe(true);
    expect(standorte.zeilen).toHaveLength(2);
  });

  it("fehlender Schlüssel wird abgelehnt", async () => {
    const r = await rufe({ name: "A" }, "");
    expect(!r.ok && r.fehler.code).toBe("idempotenz.schluessel_fehlt");
    expect(standorte.schreibzugriffe).toBe(0);
  });

  it("laufende Ausführung mit gleichem Schlüssel: idempotenz.laeuft_noch", async () => {
    await idem.beginne(
      { nutzerId: "u1", operation: "standort.anlegen", schluessel: "k1" },
      '{"name":"A"}',
    );
    const r = await rufe({ name: "A" });
    expect(!r.ok && r.fehler.code).toBe("idempotenz.laeuft_noch");
    expect(standorte.schreibzugriffe).toBe(0);
  });

  it("fachlicher Fehler gibt den Schlüssel frei: Wiederholung mit neuer Eingabe möglich", async () => {
    await rufe({ name: "A" }, "k1");
    const doppelt = await rufe({ name: "A" }, "k2");
    expect(!doppelt.ok && doppelt.fehler.code).toBe("standort.name_vergeben");
    const nochmal = await rufe({ name: "A" }, "k2");
    expect(!nochmal.ok && nochmal.fehler.code).toBe("standort.name_vergeben");
    expect(standorte.zeilen).toHaveLength(1);
  });

  it("Ausnahme in der Operation wird zu system.unerwartet mit Ursache und gibt den Schlüssel frei", async () => {
    let versuche = 0;
    const op = definiereOperation({
      name: "test.kaputt",
      schema: objekt({ x: textFeld("x", { min: 1, max: 5 }) }),
      ausfuehren: async () => {
        versuche += 1;
        if (versuche === 1) throw new Error("db weg");
        return ok(versuche);
      },
    });
    const aufruf = { kontext: nutzer, eingabe: { x: "a" }, idempotenzSchluessel: "k" };
    const erst = await fuehreAus(op, { idempotenz: idem }, aufruf);
    expect(!erst.ok && erst.fehler.code).toBe("system.unerwartet");
    expect(!erst.ok && erst.fehler.ursache).toBeInstanceOf(Error);
    expect((await fuehreAus(op, { idempotenz: idem }, aufruf)).ok).toBe(true);
  });
});

describe("P-03 Operationen: ungültige Eingabe schreibt nichts", () => {
  it.each([
    [null],
    ["text"],
    [[]],
    [{}],
    [{ name: "" }],
    [{ name: "   " }],
    [{ name: 5 }],
    [{ name: "x".repeat(81) }],
  ])("lehnt %j ab", async (eingabe) => {
    const r = await rufe(eingabe);
    expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    expect(standorte.schreibzugriffe).toBe(0);
  });

  it("nennt das fehlerhafte Feld", async () => {
    const r = await rufe({ name: "" });
    expect(!r.ok && r.fehler.details).toEqual([{ feld: "name", code: "eingabe.ungueltig" }]);
  });

  it("ungültige Eingabe reserviert den Idempotenz-Schlüssel nicht", async () => {
    await rufe({ name: "" });
    const r = await rufe({ name: "Ok" });
    expect(r.ok).toBe(true);
  });

  it("verwirft unbekannte Felder", async () => {
    const r = await rufe({ name: "A", nutzerId: "u9" });
    expect(r.ok && Object.keys(r.wert).sort()).toEqual(["id", "name", "nutzerId"]);
    expect(standorte.zeilen[0]?.nutzerId).toBe("u1");
  });
});

describe("Operationen: zentraler Zugriffscheck", () => {
  it("ohne Anmeldung: zugriff.nicht_angemeldet, nichts geschrieben", async () => {
    const r = await rufe({ name: "A" }, "k1", { nutzerId: null });
    expect(!r.ok && r.fehler.code).toBe("zugriff.nicht_angemeldet");
    expect(standorte.schreibzugriffe).toBe(0);
  });

  it("zusätzliche Berechtigung verweigert: zugriff.verweigert", async () => {
    const op = definiereOperation({
      name: "test.gesperrt",
      schema: objekt({ x: textFeld("x", { min: 1, max: 5 }) }),
      berechtigt: async () => false,
      ausfuehren: async () => fehlgeschlagen(fehler("system.unerwartet")),
    });
    const r = await fuehreAus(
      op,
      { idempotenz: idem },
      { kontext: nutzer, eingabe: { x: "a" }, idempotenzSchluessel: "k" },
    );
    expect(!r.ok && r.fehler.code).toBe("zugriff.verweigert");
  });
});
