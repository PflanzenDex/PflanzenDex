import { AsyncLocalStorage } from "node:async_hooks";
import type { Handler } from "hono";
import type { AuthEnv } from "./auth-env";

// The reads of ONE GET request (NFR-12, issue #1240). A GET handler wrapped in `readOnly` opens a scope for its own
// async context: inside it the same read for the same arguments is sent once, and every derivation of that request
// gets the same result. The scope ends with the response. Nothing is kept at module level, so no read is shared with
// another request or another account (P-04). Outside a scope every read goes straight to its adapter, as before.
// Only GET handlers open a scope: a write never answers from a read of its own request, and a failed read is forgotten
// at once, so the error reaches its caller and a later read of the same request tries again (P-10).

type Scope = Map<string, Promise<unknown>>;
const scopes = new AsyncLocalStorage<Scope>();

/** Runs `handle` in a new scope; the reads it makes, and the awaits they start, share one memo. */
function inScope<T>(handle: () => Promise<T>): Promise<T> {
  return scopes.run(new Map(), handle);
}

/** The value of `key` from the scope, or loaded once into it. A rejected load is removed again. */
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = scopes.getStore();
  if (memo === undefined) return load();
  const known = memo.get(key);
  if (known !== undefined) return known as Promise<T>;
  const pending = (async () => load())();
  memo.set(key, pending);
  pending.catch(() => {
    if (memo.get(key) === pending) memo.delete(key);
  });
  return pending;
}

/**
 * A GET handler whose reads are answered from one scope (see the comment above). Use it for read-only handlers only.
 */
export function readOnly(handler: Handler<AuthEnv>): Handler<AuthEnv> {
  return (c, next) => inScope(async () => handler(c, next));
}

/**
 * The adapter `port` with the named list reads answered from the scope: `list(userId)` is sent once per request and
 * account. The arguments identify the read, so another account gets its own load. `label` names the data, so two
 * adapters of the same table share their reads. Every other method is the adapter's own.
 */
export function sharedReads<T extends object>(
  port: T,
  label: string,
  methods: readonly (keyof T & string)[],
): T {
  const reads: Record<string, unknown> = {};
  for (const method of methods) {
    const load = port[method] as unknown as (...args: unknown[]) => Promise<unknown>;
    reads[method] = (...args: unknown[]) =>
      once(`${label}.${method}(${JSON.stringify(args)})`, () => load.apply(port, args));
  }
  return Object.assign(Object.create(port) as T, reads);
}

type ByIds = { findMany(userId: string, ids: readonly string[]): Promise<readonly unknown[]> };

/**
 * `findMany(userId, ids)` answered per id from the scope: an id the request has read already is not asked again, and
 * the missing ones are read in ONE statement (NFR-12). Results keep the order of `ids`; an unknown or unreadable id is
 * `null`, remembered like any value of the request.
 */
export function sharedFindMany<T extends ByIds>(port: T, label: string): T {
  const findMany = (userId: string, ids: readonly string[]): Promise<readonly unknown[]> => {
    const memo = scopes.getStore();
    if (memo === undefined) return port.findMany(userId, ids);
    const keyOf = (id: string) => JSON.stringify([label, userId, id]);
    const missing = [...new Set(ids)].filter((id) => !memo.has(keyOf(id)));
    if (missing.length > 0) {
      const batch = (async () => port.findMany(userId, missing))();
      missing.forEach((id, i) => {
        const key = keyOf(id);
        const pending = batch.then((rows) => rows[i] ?? null);
        memo.set(key, pending);
        pending.catch(() => {
          if (memo.get(key) === pending) memo.delete(key);
        });
      });
    }
    return Promise.all(ids.map((id) => memo.get(keyOf(id)) as Promise<unknown>));
  };
  return Object.assign(Object.create(port) as T, { findMany });
}
