// Candidates sorted by the space need (US-WUN-01, FR-LIC-04): a pure derivation over the open wishes and the stock per
// zone 2 to 4, never stored (P-01). The stock comes through the port `ZoneStockSource`; nothing is compared with an
// average (P-08), only with the other zones of the same account.
import type {
  Candidate,
  CandidateList,
  CandidatesDependencies,
  DuplicateWish,
  PriorityKind,
} from "./types";
import type { WishRow, ZoneStock } from "../types";

const plants = (n: number): string => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

interface Standing {
  /** The smallest stock over zones 2 to 4. */
  readonly least: number;
  /** Names of the zones that have it. */
  readonly leastNames: readonly string[];
  /** All zones equally full (and more than one zone): no zone is "the thinnest". */
  readonly tie: boolean;
}

function standing(zones: readonly ZoneStock[]): Standing {
  const least = Math.min(...zones.map((z) => z.count));
  return {
    least,
    leastNames: zones.filter((z) => z.count === least).map((z) => z.name),
    tie: zones.length > 1 && zones.every((z) => z.count === least),
  };
}

function priority(
  zone: ZoneStock | undefined,
  s: Standing,
  hasTarget: boolean,
): { kind: PriorityKind; text: string } {
  if (!zone && hasTarget)
    return {
      kind: "zone_outside",
      text: "Die Ziel-Lichtzone gehört nicht zu den Zonen 2 bis 4: dieser Wunsch zählt bei der Platzfrage noch nicht mit.",
    };
  if (!zone)
    return {
      kind: "zone_unknown",
      text: "Ziel-Lichtzone unbekannt: dieser Wunsch zählt bei der Platzfrage noch nicht mit (nötig ist eine Zone 2 bis 4).",
    };
  if (s.tie)
    return {
      kind: "tie",
      text: `Alle Lichtzonen 2 bis 4 sind gleich belegt (je ${plants(s.least)}): die Reihenfolge folgt der Zone und dem Namen.`,
    };
  if (zone.count === s.least)
    return {
      kind: "thinnest",
      text:
        s.least === 0
          ? "In dieser Zone steht noch keine Pflanze: hier ist am meisten Platz."
          : `Die Zone mit den wenigsten Pflanzen (${s.least}): hier ist am meisten Platz.`,
    };
  return {
    kind: "other",
    text: `Hier ${zone.count === 1 ? "steht" : "stehen"} schon ${plants(zone.count)}. Mehr Platz ist in ${s.leastNames.join(" und ")} (${plants(s.least)}).`,
  };
}

/** "German (name)"; just the name while no German name is known (P-08). */
export const titleOf = (w: Pick<WishRow, "name" | "german">): string =>
  w.german ? `${w.german} (${w.name})` : w.name;

function candidate(w: WishRow, zones: readonly ZoneStock[], s: Standing): Candidate {
  const zone = zones.find((z) => z.zoneId === w.targetZoneId);
  return {
    id: w.id,
    name: w.name,
    german: w.german,
    title: titleOf(w),
    zone: zone ? { id: zone.zoneId, name: zone.name } : null,
    stock: zone ? zone.count : null,
    zoneText: zone
      ? `${zone.name} — ${plants(zone.count)}`
      : w.targetZoneId
        ? "Ziel-Zone liegt außerhalb der Zonen 2 bis 4"
        : "Ziel-Zone unbekannt",
    difficulty: w.difficulty,
    reasoning: w.reasoning,
    // The source always travels with the picture (DM-WUN-01); a picture without one is not shown.
    image: w.imageUrl && w.imageSource ? { url: w.imageUrl, source: w.imageSource } : null,
    priority: priority(zone, s, w.targetZoneId !== null),
  };
}

/** Stock ascending; zone order, name and id break ties; unknown zone last. */
function byStock(zones: readonly ZoneStock[]) {
  const place = (c: Candidate): number => zones.findIndex((z) => z.zoneId === c.zone?.id);
  return (a: Candidate, b: Candidate): number =>
    (a.stock ?? Infinity) - (b.stock ?? Infinity) ||
    (a.stock === null ? 0 : place(a) - place(b)) ||
    a.name.localeCompare(b.name, "de") ||
    a.id.localeCompare(b.id);
}

function nextActionFor(first: Candidate, zoneName: string): string {
  if (first.priority.kind === "thinnest")
    return `Besorge diese Pflanze zuerst: ${zoneName} hat am meisten Platz.`;
  if (first.priority.kind === "tie")
    return "Die Zonen sind gleich belegt: Beginne mit dem Wunsch ganz oben.";
  return "Beginne mit dem Wunsch ganz oben: seine Zone ist unter deinen Wünschen am wenigsten belegt.";
}

function hintFor(list: readonly Candidate[]): CandidateList["hint"] {
  const first = list[0];
  if (!first)
    return {
      text: "Keine offenen Kandidaten in der Wunschliste.",
      nextAction: "Erfasse einen Wunsch mit Ziel-Lichtzone.",
    };
  if (!first.zone)
    return {
      text: "Kein offener Wunsch hat eine Ziel-Lichtzone 2 bis 4.",
      nextAction: "Lege einen Wunsch mit Ziel-Zone an, damit die Liste zeigt, wo Platz ist.",
    };
  return {
    text: `Als Nächstes dran: ${first.title} (${first.zoneText}).`,
    nextAction: nextActionFor(first, first.zone.name),
  };
}

const DUPLICATE_HINT: NonNullable<CandidateList["duplicateHint"]> = {
  text: "Diese Wünsche heißen gleich wie ein anderer: umbenennen oder zusammenführen. Sie wurden früher angelegt, als Namen mit und ohne Akzente noch als verschieden galten.",
  nextAction:
    "Benenne jeden dieser Wünsche um oder lösche ihn, wenn du den anderen Wunsch behältst.",
};

const duplicate = (w: WishRow): DuplicateWish => ({ id: w.id, name: w.name, title: titleOf(w) });

/**
 * The open candidates of the account (`status = wishlist`, FR-WUN-02), sorted ascending by the specimen count of their
 * target zone (zones 2 to 4); a wish without a usable target zone comes last and is named as not counted (FR-WUN-03,
 * P-10). Every entry says why it stands where it stands, the list says what to do next (P-09). Only the wishes and
 * the stock of the account flow in (P-04, P-05).
 */
export async function wishCandidates(
  deps: CandidatesDependencies,
  userId: string,
): Promise<CandidateList> {
  const [open, zones, keyless] = await Promise.all([
    deps.wishes.open(userId),
    deps.stock.stock(userId),
    deps.wishes.keyless(userId),
  ]);
  const s = standing(zones);
  const candidates = open.map((w) => candidate(w, zones, s)).sort(byStock(zones));
  const duplicates = keyless.map(duplicate);
  return {
    candidates,
    zones,
    hint: hintFor(candidates),
    duplicates,
    duplicateHint: duplicates.length > 0 ? DUPLICATE_HINT : null,
  };
}
