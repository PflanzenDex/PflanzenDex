import { describe, expect, it } from "vitest";
import { zoneAbleiten, zoneAbleitenGeprueft } from "./ableiten";
import { ZONEN_VOREINSTELLUNG } from "./zonen";
import type { Lichtzone } from "./typen";

const zonen: readonly Lichtzone[] = ZONEN_VOREINSTELLUNG.map((z, i) => ({
  id: `z${i + 1}`,
  name: z.name,
  luxDecke: z.luxDecke,
  ppfd: z.ppfd,
  reihenfolge: z.reihenfolge ?? i + 1,
}));
const ableiten = (lichtbedarfLux: number | null, standardStufe: number, weichesBlatt = false) =>
  zoneAbleiten({ lichtbedarfLux, standardStufe, weichesBlatt }, zonen);
const name = (a: ReturnType<typeof ableiten>) => (a.art === "zone" ? a.zone.name : a.grund);

describe("US-LIC-01 Art der richtigen Lichtzone zuordnen", () => {
  it("Gegeben Lux-Bedarf und Standard-Stufe, wenn abgeleitet wird, dann gilt die Zone des Kontos", () => {
    expect(name(ableiten(15_000, 2))).toBe("Lampe 2");
    expect(name(ableiten(100_000, 3, true))).toBe("Lampe 3");
  });

  it("die Zone ist abgeleitet: eine umbenannte Zone des Kontos erscheint mit ihrem Namen", () => {
    const eigene = zonen.map((z) => (z.id === "z2" ? { ...z, name: "Fensterbank" } : z));
    const a = zoneAbleiten(
      { lichtbedarfLux: 15_000, standardStufe: 2, weichesBlatt: false },
      eigene,
    );
    expect(a.art === "zone" && a.zone.name).toBe("Fensterbank");
  });

  it("Stecklingslicht ist nie Zielzone für Erwachsene (auch bei kleinem Bedarf)", () => {
    for (const bedarf of [1, 500, 1_500, 4_000]) expect(name(ableiten(bedarf, 2))).toBe("Lampe 2");
    expect(
      name(
        zoneAbleiten({ lichtbedarfLux: 500, standardStufe: 2, weichesBlatt: false }, [
          zonen[0] as Lichtzone,
        ]),
      ),
    ).toBe("keine_erwachsenenzone");
  });

  it("hochstufen erst ab 80 % der Lux-Decke der aktuellen Stufe", () => {
    const decke3 = 100_000;
    expect(name(ableiten(0.8 * decke3 - 1, 3))).toBe("Lampe 3");
    expect(name(ableiten(0.8 * decke3, 3))).toBe("Lampe 4");
  });

  it("liegt der Bedarf mehr als 30 % unter der Decke der höheren Zone, bleibt die Art dort", () => {
    const a = ableiten(14_000, 2);
    expect(name(a)).toBe("Lampe 2");
    expect(a.art === "zone" && a.grund).toBe("standard");
    expect(name(ableiten(70_000, 2))).toBe("Lampe 3");
    expect(name(ableiten(69_999, 2))).toBe("Lampe 2");
  });

  it("C3-Pflanzen mit weichem Blatt werden nicht automatisch hochgestuft", () => {
    const a = ableiten(100_000, 2, true);
    expect(name(a)).toBe("Lampe 2");
    expect(a.art === "zone" && a.grund).toBe("weiches_blatt");
    expect(name(ableiten(100_000, 2, false))).toBe("Lampe 4");
  });

  it("ohne Lux-Bedarf bleibt die Zone unbekannt, nie geraten (P-08)", () => {
    expect(ableiten(null, 3)).toEqual({ art: "unbekannt", grund: "kein_bedarf" });
  });

  it("hat das Konto weniger Zonen als die Standard-Stufe, gilt die höchste vorhandene", () => {
    const drei = zonen.slice(0, 3);
    const a = zoneAbleiten(
      { lichtbedarfLux: 100_000, standardStufe: 4, weichesBlatt: false },
      drei,
    );
    expect(a.art === "zone" && a.zone.name).toBe("Lampe 3");
  });

  it("geprüfte Eingabe: ungültige Werte liefern eingabe.ungueltig mit den Feldern", () => {
    const r = zoneAbleitenGeprueft({ lichtbedarfLux: 1.5, standardStufe: 1 }, zonen);
    expect(!r.ok && r.fehler.code).toBe("eingabe.ungueltig");
    expect(!r.ok && r.fehler.details?.map((d) => d.feld)).toEqual([
      "lichtbedarfLux",
      "standardStufe",
    ]);
    const g = zoneAbleitenGeprueft({ lichtbedarfLux: 15_000, standardStufe: 2 }, zonen);
    expect(g.ok && g.wert.art).toBe("zone");
  });
});
