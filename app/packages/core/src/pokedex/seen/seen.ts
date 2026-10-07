// "Newly caught" on the next visit (US-POK-12): the species the keeper has already seen are stored per account on the
// server; `new` is derived live as caught minus seen (P-01, P-04). Only the seen state is stored, never the new ones.
import { appError, defineOperation, failed, ok, shape, type ErrorDetail } from "../../kernel";
import { pokedexOwnership } from "../ownership";
import type { CaughtSpecies, OwnershipDependencies } from "../types";

/** Limits of the list of species keys (assumption, starting value): far above any realistic collection. */
export const SEEN_LIMITS = { keys: 5000, key: 200 } as const;

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). */
export interface SeenStore {
  /** The seen species keys; `null` while the account has no seen state yet (first visit). */
  find(userId: string): Promise<readonly string[] | null>;
  /** Adds the keys to the seen state, creating it when missing; answers the whole state after the write. */
  add(userId: string, species: readonly string[]): Promise<readonly string[]>;
}

/**
 * The caught species the keeper has not seen yet (US-POK-12). A missing seen state yields nothing: the first visit
 * creates it silently with the current state, so nothing counts as new (no banner).
 */
export const newlyCaught = (
  caught: readonly CaughtSpecies[],
  seen: readonly string[] | null,
): CaughtSpecies[] => {
  if (seen === null) return [];
  const known = new Set(seen);
  return caught.filter((c) => !known.has(c.species));
};

function keysField(field: string) {
  return (value: unknown): string[] | ErrorDetail => {
    const bad: ErrorDetail = { field, code: "input.invalid" };
    if (!Array.isArray(value) || value.length > SEEN_LIMITS.keys) return bad;
    const valid = value.every(
      (k) => typeof k === "string" && k.length >= 1 && k.length <= SEEN_LIMITS.key,
    );
    return valid ? [...new Set(value as string[])] : bad;
  };
}

const schema = shape({ species: keysField("species") });

export interface MarkSeenDependencies {
  readonly seen: SeenStore;
  readonly ownership: OwnershipDependencies;
}

/**
 * Marks the given species as seen (US-POK-12, P-03): "Okay" on the banner sends the species the banner showed, the
 * first visit sends the current caught species to create the state silently. Only species the account has caught can
 * be marked; anything else is refused instead of dropped (P-10). The state only grows, so a species caught in the
 * meantime stays new until it is acknowledged. The catch dates play no role here, so the zone for the derivation is fixed.
 */
export const pokedexMarkSeen = (deps: MarkSeenDependencies) =>
  defineOperation({
    name: "pokedex.mark_seen",
    schema,
    run: async ({ userId }, input) => {
      const { caught } = await pokedexOwnership(deps.ownership, userId, "UTC");
      const owned = new Set(caught.map((c) => c.species));
      if (input.species.some((k) => !owned.has(k))) return failed(appError("pokedex.not_caught"));
      return ok({ seen: await deps.seen.add(userId, input.species) });
    },
  });
