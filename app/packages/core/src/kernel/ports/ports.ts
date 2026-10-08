// Ports for persistence: `core` defines only the interfaces, adapters (e.g. Postgres, TE-02) live outside (AB-1).

/** Tenant-bound (P-04): the same key of two users is never the same entry. */
export interface IdempotencyKey {
  readonly userId: string;
  readonly operation: string;
  readonly key: string;
}

export type Begin =
  | { readonly kind: "fresh" }
  | { readonly kind: "repeat"; readonly result: unknown }
  | { readonly kind: "running" }
  | { readonly kind: "conflict" };

/**
 * Adapters must implement `begin` atomically (e.g. unique constraint): of two concurrent calls
 * with the same key exactly one gets `new`. `fingerprint` is the canonical input;
 * a result must be serializable (JSON). Retention of the keys is up to the adapter.
 */
export interface IdempotencyStore {
  begin(key: IdempotencyKey, fingerprint: string): Promise<Begin>;
  complete(key: IdempotencyKey, result: unknown): Promise<void>;
  /** Releases the key if the operation failed, so a retry stays possible. */
  discard(key: IdempotencyKey): Promise<void>;
}

/** Who is calling? Web, jobs and the AI interface build the same context (AB-3). */
export interface Context {
  readonly userId: string | null;
}

export type SignedInContext = Context & { readonly userId: string };
