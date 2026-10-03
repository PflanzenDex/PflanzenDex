import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../operation";
import type { Operation } from "../operation";
import { SpeicherImSpeicher } from "../testhilfe";
import { lichtzoneAnlegen, standortAendern, standortEinrichten, standortHinweise } from "./index";
import { LichtImSpeicher } from "./testhilfe";

let speicher: LichtImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };

const rufe = <E, A>(op: Operation<E, A>, eingabe: unknown, kontext = anna) =>
  fuehreAus(op, { idempotenz: idem }, { kontext, eingabe, idempotenzSchluessel: `k${++zaehler}` });

const einrichten = () => standortEinrichten(speicher.standortAdapter());
const zone = async (nutzer = anna) => {
  const r = await rufe(
    lichtzoneAnlegen(speicher.zonenAdapter()),
    { name: "Lampe 2", luxDecke: 15000 },
    nutzer,
  );
  if (!r.ok) throw new Error("Anlegen fehlgeschlagen");
  return r.wert;
};

beforeEach(() => {
  speicher = new LichtImSpeicher();
  idem = new SpeicherImSpeicher();
});

describe("US-LIC-05 Standort anlegen und ändern", () => {
  it("legt einen Standort mit Name, Lichtzone und Art an; beliebig viele je Zone", async () => {
    const z = await zone();
    for (const name of ["Regal", "Fensterbank", "Balkon"]) {
      const r = await rufe(einrichten(), {
        name,
        lichtzoneId: z.id,
        art: name === "Balkon" ? "aussen" : "innen",
      });
      expect(r.ok).toBe(true);
    }
    expect(speicher.standorte.map((s) => s.lichtzoneId)).toEqual([z.id, z.id, z.id]);
    expect(speicher.standorte[2]?.art).toBe("aussen");
  });

  it.each([
    [{ name: "", art: "innen" }, "name"],
    [{ name: "Regal", art: "draussen" }, "art"],
    [{ name: "Regal", art: "innen", lichtzoneId: "keine-kennung" }, "lichtzoneId"],
  ])("lehnt %j ab und schreibt nichts (Feld %s)", async (eingabe, feld) => {
    const r = await rufe(einrichten(), eingabe);
    expect(!r.ok && r.fehler.details?.map((d) => d.feld)).toEqual([feld]);
    expect(speicher.standorte).toHaveLength(0);
  });

  it("der Name ist je Konto eindeutig", async () => {
    await rufe(einrichten(), { name: "Regal", art: "innen" });
    const r = await rufe(einrichten(), { name: "regal", art: "aussen" });
    expect(!r.ok && r.fehler.code).toBe("standort.name_vergeben");
    expect((await rufe(einrichten(), { name: "Regal", art: "innen" }, ben)).ok).toBe(true);
  });

  it("eine Zone eines anderen Kontos lässt sich nicht zuordnen (P-04)", async () => {
    const fremd = await zone(ben);
    const r = await rufe(einrichten(), { name: "Regal", lichtzoneId: fremd.id, art: "innen" });
    expect(!r.ok && r.fehler.code).toBe("lichtzone.nicht_gefunden");
    expect(speicher.standorte).toHaveLength(0);
  });

  it("ändert Zone und Art; ein fremder Standort ist nicht erreichbar", async () => {
    const z = await zone();
    const s = await rufe(einrichten(), { name: "Regal", art: "innen" });
    if (!s.ok) throw new Error("Anlegen fehlgeschlagen");
    const r = await rufe(standortAendern(speicher.standortAdapter()), {
      id: s.wert.id,
      name: "Regal",
      lichtzoneId: z.id,
      art: "aussen",
    });
    expect(r.ok && r.wert).toMatchObject({ lichtzoneId: z.id, art: "aussen" });
    const fremd = await rufe(
      standortAendern(speicher.standortAdapter()),
      { id: s.wert.id, name: "Meins", art: "innen" },
      ben,
    );
    expect(!fremd.ok && fremd.fehler.code).toBe("standort.nicht_gefunden");
  });

  it("umbenennen auf einen bestehenden anderen Namen: name_vergeben", async () => {
    await rufe(einrichten(), { name: "A", art: "innen" });
    const b = await rufe(einrichten(), { name: "B", art: "innen" });
    if (!b.ok) throw new Error("Anlegen fehlgeschlagen");
    const r = await rufe(standortAendern(speicher.standortAdapter()), {
      id: b.wert.id,
      name: "A",
      art: "innen",
    });
    expect(!r.ok && r.fehler.code).toBe("standort.name_vergeben");
  });
});

describe("US-LIC-05 Standorte ohne Zone erscheinen in „Hinweise“", () => {
  it("nennt jeden Standort ohne Zone samt nächster Handlung (P-09)", () => {
    const hinweise = standortHinweise([
      { id: "s1", name: "Regal", lichtzoneId: "z1", art: "innen" },
      { id: "s2", name: "Balkon", lichtzoneId: null, art: "aussen" },
    ]);
    expect(hinweise).toEqual([
      expect.objectContaining({ art: "standort_ohne_zone", standortId: "s2" }),
    ]);
    expect(hinweise[0]?.text).toContain("Balkon");
    expect(hinweise[0]?.naechsteHandlung).toMatch(/Lichtzone/);
  });

  it("ohne betroffene Standorte gibt es keine Hinweise", () => {
    expect(standortHinweise([])).toEqual([]);
  });
});
