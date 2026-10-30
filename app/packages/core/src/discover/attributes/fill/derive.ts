import type { AttributeFact } from "../attributes";

/** What the store hands over per species: the Wikidata item and its height claims, kept from the fill snapshot. */
export interface HeightCandidate {
  /** Latin name of the species. */
  readonly latinName: string;
  /** Wikidata item (`Q…`) of the snapshot. */
  readonly itemId: string;
  /** The `claims.P2048` (height) array of the item exactly as received; its shape is not trusted. */
  readonly heightClaims: unknown;
  /** Retrieval date (YYYY-MM-DD) of the snapshot. */
  readonly retrievedAt: string;
  /** License of the snapshot as stored. */
  readonly license: string;
}

/**
 * Size classes by height in metres (starting values, assumption, decided by the PO, revisable): below 0.5 small, up to
 * and including 2 medium, above 2 large. They only turn a cited measurement into the three-level scale of DM-ENT-01.
 */
export const GROWTH_SIZE_LIMITS_M = { small: 0.5, medium: 2 } as const;

// Wikidata units of length that convert exactly: metre (Q11573) and centimetre (Q174728).
const METRES_PER_UNIT: Readonly<Record<string, number>> = { Q11573: 1, Q174728: 0.01 };

const obj = (x: unknown): Record<string, unknown> | null =>
  typeof x === "object" && x !== null ? (x as Record<string, unknown>) : null;

/** The unit as a Wikidata item id (the unit is an entity URL); `undefined` when absent. */
const unitId = (unit: unknown): string | undefined =>
  typeof unit === "string" ? unit.split("/").pop() : undefined;

/** The claim's value when it is a plain value and not deprecated, else `null`. */
function usableValue(claim: unknown): { rank: string; value: Record<string, unknown> } | null {
  const c = obj(claim);
  const snak = obj(c?.["mainsnak"]);
  const value = obj(obj(snak?.["datavalue"])?.["value"]);
  const rank = typeof c?.["rank"] === "string" ? c["rank"] : "normal";
  if (snak?.["snaktype"] !== "value" || value === null || rank === "deprecated") return null;
  return { rank, value };
}

/** Height in metres of one claim; `null` for a deprecated claim, a missing value or a unit that is not a length we convert. */
function metres(claim: unknown): { rank: string; metres: number } | null {
  const usable = usableValue(claim);
  if (usable === null) return null;
  const unit = unitId(usable.value["unit"]);
  const factor = unit === undefined ? undefined : METRES_PER_UNIT[unit];
  const amount = Number(usable.value["amount"]);
  if (factor === undefined || !Number.isFinite(amount) || amount <= 0) return null;
  return { rank: usable.rank, metres: amount * factor };
}

function sizeOf(heightMetres: number): "small" | "medium" | "large" {
  if (heightMetres < GROWTH_SIZE_LIMITS_M.small) return "small";
  return heightMetres <= GROWTH_SIZE_LIMITS_M.medium ? "medium" : "large";
}

/**
 * The growth size out of the cited height (US-ENT-09). Preferred claims count, else the normal ones; a species whose
 * usable claims fall into different classes stays unknown rather than getting one of them picked (P-08). Nothing
 * usable gives `null`. The result still has to pass `checkAttributeFact` before it is stored.
 */
export function deriveGrowthSize(c: HeightCandidate): AttributeFact | null {
  const claims = Array.isArray(c.heightClaims) ? c.heightClaims.map(metres) : [];
  const usable = claims.filter((m): m is { rank: string; metres: number } => m !== null);
  const preferred = usable.filter((m) => m.rank === "preferred");
  const sizes = new Set((preferred.length > 0 ? preferred : usable).map((m) => sizeOf(m.metres)));
  const [size] = sizes;
  if (sizes.size !== 1 || size === undefined) return null;
  return {
    species: c.latinName,
    field: "growthSize",
    value: size,
    evidence: {
      source: "wikidata",
      url: `https://www.wikidata.org/wiki/${c.itemId}`,
      license: c.license as AttributeFact["evidence"]["license"],
      retrievedAt: c.retrievedAt,
    },
  };
}
