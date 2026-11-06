// Reading the catalog and the collection through the AI interface (US-KI-11, KI-R10): the port the app fills with the
// same read functions its own routes call (FR-KI-14), and the paging every list tool shares (FR-KI-16).
import { appError, failed, integerField, orNull, type Result, type Schema } from "../../kernel";
import { mayCall, type AiRights } from "../rights";
import type { AiLogStore } from "../status";

/** A species as the catalog search of the app returns it (US-BES-01), visible to the account only. */
export interface SpeciesItem {
  readonly id: string;
  readonly latinName: string;
  /** `null` = unknown (P-08). */
  readonly germanName: string | null;
  readonly synonyms: readonly string[];
  readonly reviewStatus: string;
  /** The account proposed the species itself. */
  readonly own: boolean;
  /** Active specimens of the account of this species. */
  readonly specimens: number;
}

/** The species of the app's search (FR-BES-24): at most the cap; `more` is true when more species match. */
export interface SpeciesSearchItems {
  readonly species: readonly SpeciesItem[];
  readonly more: boolean;
}

/** A specimen as the collection shows it: the card of an active one (US-BES-06), the archive entry of an archived one. */
export interface SpecimenItem {
  readonly id: string;
  /** Specimen name with marker (DM-BES-03). */
  readonly name: string;
  readonly speciesId: string;
  /** `null` = unknown (P-08): the species is not visible any more. */
  readonly speciesName: string | null;
  readonly marker: string | null;
  readonly status: string;
  /** Name of the location; `null` = unknown or archived. */
  readonly location: string | null;
  /** Name of the effective light zone (FR-LIC-02); `null` = unknown or archived. */
  readonly lightZone: string | null;
  readonly lightZoneSource: string | null;
  readonly caughtAt: string | null;
  readonly archivedAt: string | null;
}

export interface ZoneRow {
  readonly id: string;
  readonly name: string;
  readonly luxCeiling: number;
  readonly ppfd: number | null;
  readonly sortOrder: number;
}

export interface LocationRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly lightZoneId: string | null;
}

/** The measurement view of the app (US-WAC-01) for one specimen: the measurements and what is derived from them. */
export interface MeasurementsRead {
  readonly measurements: readonly unknown[];
}

/**
 * Port: the read functions behind the app's own routes (FR-KI-14), for the account `userId` only (P-04). `null` means
 * "not found or not the account's" (both look the same).
 */
export interface CollectionReadSource {
  /** The species the app's search shows for `text` (at most the cap), and whether more match (FR-BES-24). */
  searchSpecies(userId: string, text: string): Promise<SpeciesSearchItems>;
  /** The species whose name equals `text` as a whole, also beyond the cap of `searchSpecies` (FR-BES-24). */
  exactSpecies(userId: string, text: string): Promise<readonly SpeciesItem[]>;
  species(userId: string, id: string): Promise<object | null>;
  /** All specimens, active and archived. `timeZone` decides "today" of the cards (NFR-08). */
  specimens(userId: string, timeZone: string): Promise<readonly SpecimenItem[]>;
  specimen(userId: string, id: string): Promise<object | null>;
  locations(userId: string): Promise<readonly LocationRow[]>;
  zones(userId: string): Promise<readonly ZoneRow[]>;
  measurements(userId: string, specimenId: string): Promise<MeasurementsRead | null>;
}

export interface ReadCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly input: unknown;
  readonly now: Date;
}

/** Page size: default and maximum (FR-KI-16, starting values). */
export const PAGE_SIZE = { default: 50, max: 100 } as const;

/** The paging fields every list tool takes. */
export const PAGE_FIELDS = {
  offset: orNull(integerField("offset", { min: 0, max: 100_000 })),
  limit: orNull(integerField("limit", { min: 1, max: PAGE_SIZE.max })),
};

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  /** The offset of the next page; `null` when this page is the last (P-10: a cut list says so). */
  readonly nextOffset: number | null;
}

/** One page of an already ordered list. */
export function pageOf<T>(
  all: readonly T[],
  input: { offset: number | null; limit: number | null },
): Page<T> {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? PAGE_SIZE.default;
  const items = all.slice(offset, offset + limit);
  const end = offset + items.length;
  return { items, total: all.length, offset, limit, nextOffset: end < all.length ? end : null };
}

/**
 * One read of the AI interface: the right is checked here again (KI-R8), the input by its schema (P-03), and the call
 * is logged with its operation and a count or the refusal code, never with content (FR-KI-19, P-10).
 */
export async function readCall<I, T>(
  deps: { readonly log: AiLogStore },
  call: ReadCall,
  operation: string,
  read: {
    readonly schema: Schema<I>;
    readonly run: (input: I) => Promise<Result<T>>;
    readonly effect: (value: T) => string;
  },
): Promise<Result<T>> {
  const { schema, run, effect } = read;
  if (!mayCall(call.rights, operation)) return failed(appError("ai.scope_insufficient"));
  const input = schema(call.input ?? {});
  const r = input.ok ? await run(input.value) : input;
  const entry = r.ok ? `read: ${effect(r.value)}` : `refused: ${r.error.code}`;
  await deps.log.record(
    call.userId,
    { connectionId: call.connectionId, operation, effect: entry },
    call.now,
  );
  return r;
}
