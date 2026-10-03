import { beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../index";
import { fuehreAus, katalogKuratieren, katalogPruefen, katalogVorschlagen } from "../index";
import { SpeicherImSpeicher } from "../testhilfe";
import { PruefungImSpeicher } from "./testhilfe";

const OBJEKT = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";
let idem: SpeicherImSpeicher;
let speicher: PruefungImSpeicher;
let zaehler = 0;

const rufe = <E, A>(op: Operation<E, A>, nutzerId: string | null, eingabe: unknown) =>
  fuehreAus(
    op,
    { idempotenz: idem },
    {
      kontext: { nutzerId },
      eingabe,
      idempotenzSchluessel: `k${++zaehler}`,
    },
  );

const vorschlagen = (nutzer = "halter", extra: object = {}) =>
  rufe(katalogVorschlagen(speicher), nutzer, {
    objektArt: "art",
    objektId: OBJEKT,
    status: "vorschlag",
    ...extra,
  });

beforeEach(() => {
  idem = new SpeicherImSpeicher();
  speicher = new PruefungImSpeicher({ betreiber: ["betreiber"], pruefer: ["pruefer"] });
});

describe("FR-BES-02 Nutzer können nur vorschlagen", () => {
  it("ein Pflanzenhalter legt einen Vorschlag an; er ist ihm zugeordnet und ungeprüft", async () => {
    const r = await vorschlagen();
    expect(r.ok && r.wert).toMatchObject({
      erstellerId: "halter",
      status: "vorschlag",
      geprueftVon: null,
    });
  });

  it("KI-erstellt wird gekennzeichnet (FR-BES-06)", async () => {
    const r = await vorschlagen("halter", { status: "ki_ungeprueft" });
    expect(r.ok && r.wert.status).toBe("ki_ungeprueft");
  });

  it.each(["geprueft", "kuratiert", "zurueckgewiesen", "irgendwas"])(
    "Nutzer kann sich nicht selbst als %s anlegen",
    async (status) => {
      const r = await vorschlagen("halter", { status });
      expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
      expect(speicher.zeilen).toHaveLength(0);
    },
  );

  it("verlangt Anmeldung und gültige Eingabe", async () => {
    const r = await rufe(katalogVorschlagen(speicher), null, {
      objektArt: "art",
      objektId: OBJEKT,
      status: "vorschlag",
    });
    expect(!r.ok && r.fehler.code).toBe("zugriff.nicht_angemeldet");
    const s = await vorschlagen("halter", { objektId: "keine-uuid", objektArt: "Art!" });
    expect(!s.ok && s.fehler.details?.map((d) => d.feld)).toEqual(["objektArt", "objektId"]);
  });

  it("dasselbe Objekt zweimal vorzuschlagen scheitert mit pruefung.bereits_vorhanden", async () => {
    await vorschlagen();
    const r = await vorschlagen("anderer");
    expect(!r.ok && r.fehler.code).toBe("pruefung.bereits_vorhanden");
  });
});

describe("FR-BES-14 nur Betreiber und Prüfer setzen den Prüfstatus", () => {
  const entscheide = (nutzer: string, id: string, status = "geprueft", grund?: string) =>
    rufe(katalogPruefen(speicher), nutzer, { id, status, grund });

  it.each(["betreiber", "pruefer"])(
    "%s gibt frei; Prüfer und Zeitpunkt werden festgehalten",
    async (rolle) => {
      const v = await vorschlagen();
      const id = v.ok ? v.wert.id : "";
      const r = await entscheide(rolle, id);
      expect(r.ok && r.wert).toMatchObject({ status: "geprueft", geprueftVon: rolle });
    },
  );

  it("der Ersteller und andere Nutzer können nicht freigeben (zugriff.verweigert, nichts geändert)", async () => {
    const v = await vorschlagen();
    const id = v.ok ? v.wert.id : "";
    for (const nutzer of ["halter", "fremder"]) {
      const r = await entscheide(nutzer, id);
      expect(!r.ok && r.fehler.code).toBe("zugriff.verweigert");
    }
    expect(speicher.zeilen[0]?.status).toBe("vorschlag");
  });

  it("Zurückweisen verlangt einen Grund; der Vorschlag bleibt sonst unverändert", async () => {
    const v = await vorschlagen();
    const id = v.ok ? v.wert.id : "";
    const ohne = await entscheide("betreiber", id, "zurueckgewiesen");
    expect(!ohne.ok && ohne.fehler.code).toBe("pruefung.grund_fehlt");
    const mit = await entscheide(
      "betreiber",
      id,
      "zurueckgewiesen",
      "Quelle für Lichtbedarf fehlt",
    );
    expect(mit.ok && mit.wert).toMatchObject({
      status: "zurueckgewiesen",
      grund: "Quelle für Lichtbedarf fehlt",
    });
  });

  it("nur offene Vorschläge lassen sich entscheiden; ein unbekannter Vorgang ist nicht gefunden", async () => {
    const v = await vorschlagen();
    const id = v.ok ? v.wert.id : "";
    await entscheide("betreiber", id);
    const nochmal = await entscheide("betreiber", id, "zurueckgewiesen", "zu spät");
    expect(!nochmal.ok && nochmal.fehler.code).toBe("pruefung.status_unzulaessig");
    const fehlt = await entscheide("betreiber", "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99");
    expect(!fehlt.ok && fehlt.fehler.code).toBe("pruefung.nicht_gefunden");
  });

  it("freigeben kann man nicht als `vorschlag` zurücksetzen (Status nur geprueft oder zurueckgewiesen)", async () => {
    const r = await entscheide("betreiber", OBJEKT, "vorschlag");
    expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
  });

  it("Kuratieren (Betreiber-Batch) ist nur für Prüfer und liefert sofort `kuratiert`", async () => {
    const neu = { objektArt: "art", objektId: OBJEKT };
    const nein = await rufe(katalogKuratieren(speicher), "halter", neu);
    expect(!nein.ok && nein.fehler.code).toBe("zugriff.verweigert");
    const ja = await rufe(katalogKuratieren(speicher), "betreiber", neu);
    expect(ja.ok && ja.wert).toMatchObject({ status: "kuratiert", geprueftVon: "betreiber" });
  });
});
