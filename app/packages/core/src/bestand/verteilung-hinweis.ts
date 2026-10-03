import type { Lichtzone } from "../licht";
import type { VerteilungsHinweis, ZonenZaehlung } from "./verteilung-typen";

const nenne = (namen: readonly string[]): string =>
  namen.length < 2 ? namen.join("") : `${namen.slice(0, -1).join(", ")} und ${namen.at(-1)}`;

const exemplare = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/**
 * Sagt, wo noch Platz ist, und immer, was als Nächstes zu tun ist (P-09). Bei Gleichstand stehen alle Gleichplatzierten
 * im Text und die Handlung verweist auf die Wunschliste (US-LIC-02).
 */
export function verteilungsHinweis(
  zonen: readonly ZonenZaehlung[],
  duennste: readonly Lichtzone[],
): VerteilungsHinweis {
  if (zonen.length === 0)
    return {
      text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
      naechsteHandlung:
        "Lege unter „Licht“ mindestens zwei Lichtzonen an oder übernimm die Standard-Lampen.",
    };
  const anzahl = zonen.find((z) => z.zone.id === duennste[0]?.id)?.anzahl;
  if (anzahl === undefined)
    return {
      text: "Noch kein Exemplar steht in einer Zone für erwachsene Pflanzen.",
      naechsteHandlung: "Lege ein Exemplar an und ordne seinem Standort eine Lichtzone zu.",
    };
  const namen = duennste.map((z) => z.name);
  if (duennste.length > 1)
    return {
      text: `${nenne(namen)} sind gleich dünn besetzt (je ${exemplare(anzahl)}).`,
      naechsteHandlung: "Setze Arten für diese Zonen auf die Wunschliste.",
    };
  return {
    text: `${nenne(namen)} ist die dünnste Zone (${exemplare(anzahl)}).`,
    naechsteHandlung: "Hier ist noch Platz: Plane das nächste Exemplar für diese Zone.",
  };
}
