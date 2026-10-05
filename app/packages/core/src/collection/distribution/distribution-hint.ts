import type { LightZone } from "../../light";
import type { DistributionHint, ZoneCount } from "./distribution-types";

const name = (names: readonly string[]): string =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;

const specimens = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/**
 * Says where there is still room, and always what to do next (P-09). With a tie all tied ones are named in the text and
 * the action points to the wishlist (US-LIC-02).
 */
export function distributionHint(
  zones: readonly ZoneCount[],
  thinnest: readonly LightZone[],
): DistributionHint {
  if (zones.length === 0)
    return {
      text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
      nextAction:
        "Lege unter „Licht“ mindestens zwei Lichtzonen an oder übernimm die Standard-Lampen.",
    };
  const count = zones.find((z) => z.zone.id === thinnest[0]?.id)?.count;
  if (count === undefined)
    return {
      text: "Noch kein Exemplar steht in einer Zone für erwachsene Pflanzen.",
      nextAction: "Lege ein Exemplar an und ordne seinem Standort eine Lichtzone zu.",
    };
  const names = thinnest.map((z) => z.name);
  if (thinnest.length > 1)
    return {
      text: `${name(names)} sind gleich dünn besetzt (je ${specimens(count)}).`,
      nextAction: "Setze Arten für diese Zonen auf die Wunschliste.",
    };
  return {
    text: `${name(names)} ist die dünnste Zone (${specimens(count)}).`,
    nextAction: "Hier ist noch Platz: Plane das nächste Exemplar für diese Zone.",
  };
}
