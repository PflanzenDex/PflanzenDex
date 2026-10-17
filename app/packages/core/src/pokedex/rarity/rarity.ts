// Rarity in PflanzenDex (US-POK-14): the share of the participating accounts (setting on) that own a species with at
// least one active specimen. Per account, not per specimen; derived live, never stored (P-01). Only counts leave this
// module: no result names an account (P-04, P-05). Nothing is estimated: without participants the value is unknown (P-08).
import type { SpeciesSource } from "../../collection";
import { speciesKey } from "../ownership";

/** The accounts that consented; the adapter lives in `db` (module account). */
export interface RarityParticipants {
  rarityParticipants(): Promise<readonly string[]>;
}

/** Species with an active specimen, one row per account and species, only for the given accounts (module collection). */
export interface ActiveSpeciesSource {
  activeSpeciesOf(
    accountIds: readonly string[],
  ): Promise<readonly { accountId: string; speciesId: string }[]>;
}

export interface RarityDependencies {
  readonly participants: RarityParticipants;
  readonly owned: ActiveSpeciesSource;
  readonly species: Pick<SpeciesSource, "findMany">;
}

/** Counts only: how many accounts take part and how many of them own each species key. */
export interface AppRarityBasis {
  readonly participants: number;
  readonly owners: ReadonlyMap<string, number>;
}

export const NO_APP_RARITY: AppRarityBasis = { participants: 0, owners: new Map() };

/** `percent` is rounded to a whole number; the interface always shows `owners` and `participants` next to it. */
export interface AppRarity {
  readonly owners: number;
  readonly participants: number;
  readonly percent: number;
}

/** Reads the basis for the viewer; species the viewer cannot read are ignored (P-04). */
export async function readAppRarityBasis(
  deps: RarityDependencies,
  userId: string,
): Promise<AppRarityBasis> {
  const accounts = await deps.participants.rarityParticipants();
  if (accounts.length === 0) return NO_APP_RARITY;
  const rows = await deps.owned.activeSpeciesOf(accounts);
  const ids = [...new Set(rows.map((r) => r.speciesId))];
  const read = await deps.species.findMany(userId, ids);
  const keyOf = new Map(
    ids.map((id, i) => [id, speciesKey(read[i]?.latinName ?? "").species] as const),
  );
  const per = new Map<string, Set<string>>();
  for (const { accountId, speciesId } of rows) {
    const key = keyOf.get(speciesId) ?? null;
    if (key !== null) per.set(key, (per.get(key) ?? new Set()).add(accountId));
  }
  return {
    participants: accounts.length,
    owners: new Map([...per].map(([key, set]) => [key, set.size])),
  };
}

/** `null` = unknown: no account takes part. */
export function appRarityOf(basis: AppRarityBasis, latinName: string): AppRarity | null {
  if (basis.participants === 0) return null;
  const key = speciesKey(latinName).species;
  const owners = key === null ? 0 : (basis.owners.get(key) ?? 0);
  return {
    owners,
    participants: basis.participants,
    percent: Math.round((owners * 100) / basis.participants),
  };
}
