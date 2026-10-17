// Collector cards (US-POK-01): one card per species of the taxonomy tree, caught or missing. "Caught" is derived live
// from the ownership, never stored (P-01). Unknown values stay `null` and the interface shows "unbekannt" (P-08).
import { SPECIES_POOR_MAX } from "../browse";
import { appRarityOf, NO_APP_RARITY, type AppRarity, type AppRarityBasis } from "../rarity";
import type { IucnCategory } from "../taxonomy";
import type { CatchDate, CaughtSpecies } from "../types";

/** Rarity in nature (US-POK-13): each value with the link to its source and the retrieval date; `null` = unknown. */
export interface NatureRarityRow {
  readonly iucn: {
    readonly category: IucnCategory;
    readonly url: string;
    readonly retrievedAt: string;
  } | null;
  readonly occurrences: {
    readonly count: number;
    readonly url: string;
    readonly retrievedAt: string;
  } | null;
}

/** Categories that make the card say the species is threatened in the wild. */
const THREATENED: readonly IucnCategory[] = ["VU", "EN", "CR", "EW"];

/** One resolved species of the tree. */
export interface TaxonCardRow {
  readonly latinName: string;
  readonly genus: string;
  readonly family: string | null;
  readonly order: string | null;
  readonly summary: string | null;
  /** Language of the summary as the taxonomy job stored it; `null` = unknown (P-08). */
  readonly summaryLanguage: "de" | "en" | null;
  /** Link only: the image itself is not stored (P-05). */
  readonly imageUrl: string | null;
  readonly pageUrl: string | null;
  readonly genusSpeciesCount: number | null;
  readonly natureRarity: NatureRarityRow;
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
  /** Counts for the rarity in PflanzenDex (US-POK-14); only numbers, no account (P-04). */
  appRarity(userId: string): Promise<AppRarityBasis>;
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
  /** Language of `summary` (WCAG 3.1.2); `null` = unknown. */
  readonly summaryLanguage: "de" | "en" | null;
  readonly genus: string;
  readonly genusSpeciesCount: number | null;
  readonly speciesPoor: boolean;
  readonly difficulty: number | null;
  readonly lightZone: number | null;
  readonly imageUrl: string | null;
  /** Wikipedia article the text and image come from (CC BY-SA, FR-POK-07). */
  readonly sourceUrl: string | null;
  readonly family: string | null;
  /** Order of the taxonomy tree; `null` = unknown (P-08). */
  readonly order: string | null;
  readonly caughtDate: CatchDate | null;
  readonly specimenCount: number;
  /**
   * Rarity in nature (US-POK-13), shown as information only: never a sort key, filter, badge or reward. `threatened`
   * (VU, EN, CR, EW) only drives a neutral note.
   */
  readonly natureRarity: NatureRarityRow & { readonly threatened: boolean };
  /**
   * Rarity in PflanzenDex (US-POK-14): owners and participants of the consenting accounts; `null` = unknown. Information
   * only, like the rarity in nature: never a sort key, filter, badge or reward.
   */
  readonly appRarity: AppRarity | null;
}

/** "Birkenfeige (Zimmerlinde)" becomes "Birkenfeige". */
export function shortGermanName(name: string | null): string | null {
  if (name === null) return null;
  const open = name.indexOf("(");
  return (open === -1 ? name : name.slice(0, open)).trim() || name;
}

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

/** What the card needs besides the tree row: catalog facts, own ownership and the rarity counts. */
interface CardContext {
  readonly facts: Omit<SpeciesFacts, "latinName">;
  readonly mine: CaughtSpecies | undefined;
  readonly basis: AppRarityBasis;
}

function cardOf(number: number, t: TaxonCardRow, ctx: CardContext): CollectorCard {
  const { facts: f, mine, basis } = ctx;
  return {
    number,
    species: t.latinName,
    state: mine ? "caught" : "missing",
    germanName: shortGermanName(f.germanName),
    germanNameFull: f.germanName,
    summary: t.summary,
    summaryLanguage: t.summaryLanguage,
    genus: t.genus,
    genusSpeciesCount: t.genusSpeciesCount,
    speciesPoor: t.genusSpeciesCount !== null && t.genusSpeciesCount <= SPECIES_POOR_MAX,
    difficulty: f.difficulty,
    lightZone: f.lightZone,
    imageUrl: t.imageUrl,
    sourceUrl: t.pageUrl,
    family: t.family,
    order: t.order,
    caughtDate: mine ? mine.caughtDate : null,
    specimenCount: mine ? mine.specimenCount : 0,
    appRarity: appRarityOf(basis, t.latinName),
    natureRarity: {
      ...t.natureRarity,
      threatened: t.natureRarity.iucn !== null && THREATENED.includes(t.natureRarity.iucn.category),
    },
  };
}

export function collectorCards(
  tree: readonly TaxonCardRow[],
  facts: readonly SpeciesFacts[],
  caught: readonly CaughtSpecies[],
  basis: AppRarityBasis = NO_APP_RARITY,
): CollectorCard[] {
  const owned = new Map(caught.map((c) => [c.species, c]));
  const known = new Map(facts.map((f) => [f.latinName, f]));
  return [...tree].sort(byTree).map((t, i) =>
    cardOf(i + 1, t, {
      facts: known.get(t.latinName) ?? NO_FACTS,
      mine: owned.get(t.latinName),
      basis,
    }),
  );
}

/** Cards of the account: the tree through the port, ownership derived by the caller (P-04). */
export async function readCollectorCards(
  source: TaxonCardSource,
  userId: string,
  caught: readonly CaughtSpecies[],
): Promise<CollectorCard[]> {
  const [tree, facts, basis] = await Promise.all([
    source.tree(),
    source.facts(userId),
    source.appRarity(userId),
  ]);
  return collectorCards(tree, facts, caught, basis);
}
