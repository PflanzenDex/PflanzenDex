import { beforeEach, describe, expect, it } from "vitest";
import { LichtImSpeicher } from "../licht/testhilfe";
import { zonenVerteilung, type VerteilungsAbhaengigkeiten } from "./index";
import { ArtenStub, ExemplareImSpeicher, testArt } from "./testhilfe";

const ART_NIEDRIG = "11111111-1111-4111-8111-111111111111"; // 15.000 Lux, Stufe 2: Lampe 2
const ART_HOCH = "22222222-2222-4222-8222-222222222222"; // 40.000 Lux, Stufe 3: Lampe 3
const ART_FREMD = "99999999-9999-4999-8999-999999999999"; // nur für ben sichtbar

const licht = new LichtImSpeicher();
const arten = new ArtenStub([
  { art: testArt(ART_NIEDRIG, { lichtbedarfLux: 15000, standardStufe: 2 }) },
  { art: testArt(ART_HOCH, { lichtbedarfLux: 40000, standardStufe: 3 }) },
  { art: testArt(ART_FREMD), nur: "ben" },
]);
let exemplare: ExemplareImSpeicher;
let n = 0;
const zoneId: Record<string, string> = {};
const standortId: Record<string, string> = {};

const deps = (): VerteilungsAbhaengigkeiten => ({
  exemplare,
  arten,
  standorte: licht.standortAdapter(),
  zonen: licht.zonenAdapter(),
});

const zonenAnlegen = async (nutzerId: string, namen: readonly string[]) => {
  const luxDecken = [1_500, 15_000, 100_000, 110_000];
  for (const [i, name] of namen.entries()) {
    const z = await licht
      .zonenAdapter()
      .anlegen(nutzerId, { name, luxDecke: luxDecken[i] ?? 1, ppfd: null, reihenfolge: null });
    if (typeof z === "string") throw new Error(z);
    zoneId[`${nutzerId}:${name}`] = z.id;
  }
};
const standort = async (nutzerId: string, name: string, zone: string | null) => {
  const s = await licht.standortAdapter().anlegen(nutzerId, {
    name,
    lichtzoneId: zone === null ? null : (zoneId[`${nutzerId}:${zone}`] ?? null),
    art: "innen",
  });
  if (typeof s === "string") throw new Error(s);
  standortId[`${nutzerId}:${name}`] = s.id;
};
type Status = "pflanze" | "steckling" | "archiviert";
const lege = async (
  nutzerId: string,
  ort: string | null,
  extra: { artId?: string; status?: Status } = {},
) => {
  n += 1;
  const r = await exemplare.anlegen(nutzerId, {
    artId: extra.artId ?? ART_NIEDRIG,
    name: `Pflanze ${n}`,
    kennzeichen: null,
    standortId: ort === null ? null : (standortId[`${nutzerId}:${ort}`] ?? null),
    gefangenAm: null,
  });
  if (typeof r === "string") throw new Error(r);
  const i = exemplare.zeilen.findIndex((z) => z.id === r.id);
  const zeile = exemplare.zeilen[i];
  if (extra.status && zeile) exemplare.zeilen[i] = { ...zeile, status: extra.status };
};
const anzahlen = async (nutzerId: string) =>
  (await zonenVerteilung(deps(), nutzerId)).zonen.map((z) => [z.zone.name, z.anzahl]);

beforeEach(async () => {
  licht.zonen.length = 0;
  licht.standorte.length = 0;
  n = 0;
  await zonenAnlegen("anna", ["Lampe 1", "Lampe 2", "Lampe 3", "Lampe 4"]);
  await standort("anna", "Steckling-Ecke", "Lampe 1");
  await standort("anna", "Fensterbank", "Lampe 2");
  await standort("anna", "Regal", "Lampe 3");
  await standort("anna", "Wüstenbank", "Lampe 4");
  await standort("anna", "Kiste", null);
  exemplare = new ExemplareImSpeicher({
    anna: Object.entries(standortId)
      .filter(([k]) => k.startsWith("anna:"))
      .map(([, id]) => id),
    ben: [],
  });
});

describe("US-LIC-02 Zählung je Zone 2 bis 4 auf Exemplar-Ebene", () => {
  it("zählt die Exemplare je Zone 2 bis 4 in der Reihenfolge der Zonen, auch Zonen mit null", async () => {
    await lege("anna", "Fensterbank");
    await lege("anna", "Regal");
    await lege("anna", "Regal");
    expect(await anzahlen("anna")).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 2],
      ["Lampe 4", 0],
    ]);
  });

  it("die Zone des Exemplars (über seinen Standort) geht der Zone der Art vor", async () => {
    // Die Art gehört nach Lampe 2, das Exemplar steht aber unter Lampe 4.
    await lege("anna", "Wüstenbank", { artId: ART_NIEDRIG });
    expect(await anzahlen("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
  });

  it("ohne Zone am Exemplar gilt die aus dem Lux-Bedarf abgeleitete Zone der Art", async () => {
    await lege("anna", null, { artId: ART_NIEDRIG });
    await lege("anna", "Kiste", { artId: ART_HOCH }); // Standort ohne Zone
    expect(await anzahlen("anna")).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
  });

  it("Stecklingslicht zählt nicht: Status Steckling und Standort in der niedrigsten Zone", async () => {
    await lege("anna", "Fensterbank", { status: "steckling" });
    await lege("anna", "Steckling-Ecke");
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.zonen.map((z) => z.anzahl)).toEqual([0, 0, 0]);
    expect(v.nichtGezaehlt.stecklingslicht).toBe(2);
  });

  it("archivierte Exemplare zählen nicht und werden ausgewiesen (nichts verschwindet still)", async () => {
    await lege("anna", "Regal", { status: "archiviert" });
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.zonen.map((z) => z.anzahl)).toEqual([0, 0, 0]);
    expect(v.nichtGezaehlt.archiviert).toBe(1);
  });

  it("ein Exemplar, dessen Art nicht lesbar ist und das keine Zone hat, heißt „Zone unbekannt“ (P-08)", async () => {
    await lege("anna", null, { artId: ART_FREMD });
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.zonen.map((z) => z.anzahl)).toEqual([0, 0, 0]);
    expect(v.nichtGezaehlt.zoneUnbekannt).toBe(1);
  });
});

describe("US-LIC-02 dünnste Zone und Gleichstand", () => {
  it("nennt die dünnste Zone und sagt, was als Nächstes zu tun ist (P-09)", async () => {
    await lege("anna", "Fensterbank");
    await lege("anna", "Fensterbank");
    await lege("anna", "Regal");
    await lege("anna", "Regal");
    await lege("anna", "Wüstenbank");
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.duennste.map((z) => z.name)).toEqual(["Lampe 4"]);
    expect(v.hinweis.text).toContain("Lampe 4");
    expect(v.hinweis.naechsteHandlung).not.toBe("");
  });

  it("bei Gleichstand nennt sie alle Gleichplatzierten und verweist auf die Wunschliste", async () => {
    await lege("anna", "Fensterbank");
    await lege("anna", "Fensterbank");
    await lege("anna", "Regal");
    await lege("anna", "Wüstenbank");
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.duennste.map((z) => z.name)).toEqual(["Lampe 3", "Lampe 4"]);
    expect(v.hinweis.text).toContain("Lampe 3 und Lampe 4");
    expect(v.hinweis.naechsteHandlung).toContain("Wunschliste");
  });

  it("bei Gleichstand aller drei Zonen stehen alle drei in der Liste", async () => {
    await lege("anna", "Fensterbank");
    await lege("anna", "Regal");
    await lege("anna", "Wüstenbank");
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.duennste.map((z) => z.name)).toEqual(["Lampe 2", "Lampe 3", "Lampe 4"]);
    expect(v.hinweis.text).toContain("Lampe 2, Lampe 3 und Lampe 4");
    expect(v.hinweis.naechsteHandlung).toContain("Wunschliste");
  });

  it("ohne gezählte Exemplare gibt es keine dünnste Zone, sondern einen Hinweis auf das nächste Exemplar", async () => {
    const v = await zonenVerteilung(deps(), "anna");
    expect(v.duennste).toEqual([]);
    expect(v.hinweis.text).toContain("Noch kein Exemplar");
    expect(v.hinweis.naechsteHandlung).toContain("Exemplar");
  });

  it("ohne Zonen für Erwachsene (weniger als zwei Lichtzonen) sagt der Hinweis, Zonen anzulegen", async () => {
    await zonenAnlegen("carla", ["Einzige Lampe"]);
    const v = await zonenVerteilung(deps(), "carla");
    expect(v.zonen).toEqual([]);
    expect(v.duennste).toEqual([]);
    expect(v.hinweis.naechsteHandlung).toContain("Lichtzone");
  });
});

describe("US-LIC-02 Mandant: nur eigene Exemplare und Zonen", () => {
  it("zählt nur die Exemplare des fragenden Kontos und kennt keine fremden Zonen", async () => {
    await zonenAnlegen("ben", ["Bens 1", "Bens 2", "Bens 3"]);
    await standort("ben", "Bens Regal", "Bens 3");
    exemplare = new ExemplareImSpeicher({
      anna: [standortId["anna:Regal"] as string],
      ben: [standortId["ben:Bens Regal"] as string],
    });
    await lege("anna", "Regal");
    await lege("ben", "Bens Regal");
    await lege("ben", "Bens Regal");
    expect(await anzahlen("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(await anzahlen("ben")).toEqual([
      ["Bens 2", 0],
      ["Bens 3", 2],
    ]);
  });
});
