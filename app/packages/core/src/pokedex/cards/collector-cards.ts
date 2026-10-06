// Collector cards (US-POK-01): one card per species of the taxonomy tree, caught or missing. "Caught" is derived live
// from the ownership, never stored (P-01). Unknown values stay `null` and the interface shows "unbekannt" (P-08).
import { SPECIES_POOR_MAX } from "../browse";
import type { CatchDate, CaughtSpecies } from "../types";

/** One resolved species of the tree. */
export interface TaxonCardRow {
  readonly latinName: string;
  readonly genus: string;
  readonly family: string | null;
  readonly order: string | null;
  readonly summary: string | null;
  /** Link only: the image itself is not stored (P-05). */
  readonly imageUrl: string | null;
  readonly pageUrl: string | null;
  readonly genusSpeciesCount: number | null;
}

/** What the approved catalog says about a species of the tree; `null` means "unknown" (P-08). */
export interface SpeciesFacts {
  readonly latinName: string;
  readonly germanName: string | null;
  readonly difficulty: number | null;
  /** Standard light zone (2-4). */
  readonly lightZone: number | null;
}

/** Reading ports; the tree is shared by all accounts and holds no user data, the catalog applies to the account (P-04). */
export interface TaxonCardSource {
  tree(): Promise<readonly TaxonCardRow[]>;
  facts(userId: string): Promise<readonly SpeciesFacts[]>;
}

export interface CollectorCard {
  /** Consecutive in the current tree order (FR-POK-06). */
  readonly number: number;
  readonly species: string;
  readonly state: "caught" | "missing";
  readonly germanName: string | null;
  /** Full name for the tooltip. */
  readonly germanNameFull: string | null;
  readonly summary: string | null;
  readonly genus: string;
  readonly genusSpeciesCount: number | null;
  readonly speciesPoor: boolean;
  readonly difficulty: number | null;
  readonly lightZone: number | null;
  readonly imageUrl: string | null;
  /** Wikipedia article the text and image come from (CC BY-SA, FR-POK-07). */
  readonly sourceUrl: string | null;
  readonly family: string | null;
  readonly caughtDate: CatchDate | null;
  readonly specimenCount: number;
}

/** "Birkenfeige (Zimmerlinde)" becomes "Birkenfeige". */
export const shortGermanName = (name: string | null): string | null =>
  name === null ? null : name.replace(/\s*\(.*$/, "").trim() || name;

const compare = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "de");
};

const byTree = (a: TaxonCardRow, b: TaxonCardRow) =>
  compare(a.order, b.order) ||
  compare(a.family, b.family) ||
  compare(a.genus, b.genus) ||
  compare(a.latinName, b.latinName);

const NO_FACTS = { germanName: null, difficulty: null, lightZone: null };

function cardOf(
  number: number,
  t: TaxonCardRow,
  f: Omit<SpeciesFacts, "latinName">,
  mine: CaughtSpecies | undefined,
): CollectorCard {
  return {
    number,
    species: t.latinName,
    state: mine ? "caught" : "missing",
    germanName: shortGermanName(f.germanName),
    germanNameFull: f.germanName,
    summary: t.summary,
    genus: t.genus,
    genusSpeciesCount: t.genusSpeciesCount,
    speciesPoor: t.genusSpeciesCount !== null && t.genusSpeciesCount <= SPECIES_POOR_MAX,
    difficulty: f.difficulty,
    lightZone: f.lightZone,
    imageUrl: t.imageUrl,
    sourceUrl: t.pageUrl,
    family: t.family,
    caughtDate: mine ? mine.caughtDate : null,
    specimenCount: mine ? mine.specimenCount : 0,
  };
}

export function collectorCards(
  tree: readonly TaxonCardRow[],
  facts: readonly SpeciesFacts[],
  caught: readonly CaughtSpecies[],
): CollectorCard[] {
  const owned = new Map(caught.map((c) => [c.species, c]));
  const known = new Map(facts.map((f) => [f.latinName, f]));
  return [...tree]
    .sort(byTree)
    .map((t, i) => cardOf(i + 1, t, known.get(t.latinName) ?? NO_FACTS, owned.get(t.latinName)));
}

/** Cards of the account: the tree through the port, ownership derived by the caller (P-04). */
export async function readCollectorCards(
  source: TaxonCardSource,
  userId: string,
  caught: readonly CaughtSpecies[],
): Promise<CollectorCard[]> {
  const [tree, facts] = await Promise.all([source.tree(), source.facts(userId)]);
  return collectorCards(tree, facts, caught);
}
