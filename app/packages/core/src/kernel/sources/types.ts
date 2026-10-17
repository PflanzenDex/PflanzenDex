import type { Result } from "../result";

// Port and value types for external sources (TE-09, NFR-17). `core` only describes them; adapters live in the API (AB-1).

export const SOURCE_NAMES = ["wikipedia", "wikidata", "gbif", "opentree", "commons"] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

/** What a consumer asks of a source. The adapter builds the URL; `body` makes it a POST (OpenTree). */
export interface SourceRequest {
  readonly source: SourceName;
  /** Path below the source's API root, starting with "/". */
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /** Language edition (Wikipedia only), e.g. "de". */
  readonly language?: string;
}

/** Where a value came from (P-08: every value names its source). */
export interface Provenance {
  readonly source: SourceName;
  readonly url: string;
  /** ISO timestamp of the retrieval; for a cached answer the time of the original retrieval. */
  readonly retrievedAt: string;
}

/** "No hit" is an answer, not an error; it is cached like a hit. */
export type SourceOutcome =
  | {
      readonly kind: "found";
      readonly data: unknown;
      readonly provenance: Provenance;
      readonly cached: boolean;
    }
  | { readonly kind: "not_found"; readonly provenance: Provenance; readonly cached: boolean };

/** Throttled, retried and cached access to one request. Failures are an `AppError`, never swallowed (P-10). */
export interface SourceClient {
  get(request: SourceRequest): Promise<Result<SourceOutcome>>;
}

/** Cache for hits and "no hit". Errors are never stored. Expiry is the adapter's job (`ttlMs`). */
export interface SourceCache {
  get(key: string): Promise<SourceOutcome | undefined>;
  set(key: string, outcome: SourceOutcome, ttlMs: number): Promise<void>;
}
