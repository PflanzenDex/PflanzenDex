// Names instead of IDs (FR-KI-15, KI-R4): one rule that turns a reference given by id or by readable name into exactly
// one entity of the account, or into the candidates, or into "not found" with the nearest names. Every tool that takes a
// reference uses it; later slices (writes, import) resolve the same way.
import { appError, isId, type AppError, type ErrorCode } from "../../kernel";

/** An entity that can be named: its id, every name it answers to and the name shown to the client. */
export interface Named {
  readonly id: string;
  readonly label: string;
  readonly names: readonly string[];
}

export interface Candidate {
  readonly id: string;
  readonly name: string;
}

/** `more`: more entities match than `candidates` lists (FR-KI-15); no count is given (P-08). */
export type Resolution =
  | { readonly kind: "found"; readonly id: string }
  | {
      readonly kind: "ambiguous";
      readonly candidates: readonly Candidate[];
      readonly more: boolean;
    }
  | { readonly kind: "none"; readonly nearest: readonly string[] };

/**
 * Nearest names on "not found" and candidates on "ambiguous"; without a hit the nearest names come from a search for
 * the first `prefix` characters, which needs at least `minSearch` (the catalog search's minimum). Starting values,
 * assumption.
 */
export const NAMING_LIMITS = { nearest: 5, candidates: 20, prefix: 3, minSearch: 2 } as const;

/** Case, accents, dashes, brackets and repeated spaces do not matter: "Aloe vera (blau)" = "Aloe vera – blau". */
export const normalizeName = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + cost);
    }
    row = next;
  }
  return row[b.length] ?? 0;
}

/** Up to `NAMING_LIMITS.nearest` names closest to the reference, nearest first, then alphabetical. */
export function nearestNames(items: readonly Named[], norm: string): string[] {
  return items
    .map((i) => ({
      label: i.label,
      d: Math.min(...i.names.map((n) => distance(normalizeName(n), norm))),
    }))
    .sort((a, b) => a.d - b.d || a.label.localeCompare(b.label))
    .slice(0, NAMING_LIMITS.nearest)
    .map((x) => x.label);
}

const toCandidates = (items: readonly Named[]): Candidate[] =>
  items.slice(0, NAMING_LIMITS.candidates).map((i) => ({ id: i.id, name: i.label }));

/**
 * No hit gives null. One hit is found, unless the pool was cut: a cut pool may hold more matches than it shows, so one
 * hit proves nothing (KI-R4) and is ambiguous with `more` true.
 */
function decide(hits: readonly Named[], cut: boolean): Resolution | null {
  if (hits.length === 0) return null;
  if (hits.length === 1 && !cut) return { kind: "found", id: (hits[0] as Named).id };
  return {
    kind: "ambiguous",
    candidates: toCandidates(hits),
    more: cut || hits.length > NAMING_LIMITS.candidates,
  };
}

/**
 * Resolves a reference among the entities of the account (FR-KI-15): an id is taken as it is (the read that follows
 * answers `not_found` for an id the account does not have); a name is matched exactly first, then as a part of a name.
 * One hit is used, several hits are candidates and nothing is done (KI-R4), none gives the nearest names. `cut` says that
 * the pool was cut at a cap (FR-BES-24): exact names are complete anyway, so it applies to partial names only.
 */
export function resolveName(items: readonly Named[], ref: string, cut = false): Resolution {
  if (isId(ref)) return { kind: "found", id: ref.toLowerCase() };
  const norm = normalizeName(ref);
  const names = (i: Named) => i.names.map(normalizeName);
  const exact = decide(
    items.filter((i) => names(i).includes(norm)),
    false,
  );
  if (exact) return exact;
  const partial = decide(
    items.filter((i) => names(i).some((n) => norm !== "" && n.includes(norm))),
    cut,
  );
  return partial ?? { kind: "none", nearest: nearestNames(items, norm) };
}

/** The refusal of an unresolved reference: candidates (KI-R4) or the entity's `not_found` with the nearest names. */
export function referenceError(
  r: Exclude<Resolution, { kind: "found" }>,
  field: string,
  notFound: ErrorCode,
): AppError {
  return r.kind === "ambiguous"
    ? appError("ai.reference_ambiguous", {
        details: [{ field, code: "ai.reference_ambiguous" }],
        data: { field, candidates: r.candidates, more: r.more },
      })
    : appError(notFound, {
        details: [{ field, code: notFound }],
        data: { field, nearest: r.nearest },
      });
}
