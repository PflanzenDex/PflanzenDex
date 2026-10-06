import type { Begin, IdempotencyKey, IdempotencyStore } from "./ports";
import { defineOperation } from "./operation";
import { appError } from "./error";
import { failed, ok } from "./result";
import { shape, textField } from "./input";

const id = (s: IdempotencyKey) => JSON.stringify([s.userId, s.operation, s.key]);

/** In-memory adapter for tests only; the real adapter comes with TE-02. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<
    string,
    { fingerprint: string; result?: unknown; done: boolean }
  >();

  async begin(key: IdempotencyKey, fingerprint: string): Promise<Begin> {
    const present = this.entries.get(id(key));
    if (!present) {
      this.entries.set(id(key), { fingerprint, done: false });
      return { kind: "fresh" };
    }
    if (present.fingerprint !== fingerprint) return { kind: "conflict" };
    return present.done ? { kind: "repeat", result: present.result } : { kind: "running" };
  }

  async complete(key: IdempotencyKey, result: unknown): Promise<void> {
    const e = this.entries.get(id(key));
    if (e) Object.assign(e, { result, done: true });
  }

  async discard(key: IdempotencyKey): Promise<void> {
    this.entries.delete(id(key));
  }
}

export class InMemoryLocations implements LocationStore {
  readonly rows: Location[] = [];
  writes = 0;

  async create(userId: string, name: string): Promise<Location | "name_taken"> {
    this.writes += 1;
    if (this.rows.some((s) => s.userId === userId && s.name === name)) return "name_taken";
    const location = { id: `s${this.rows.length + 1}`, userId, name };
    this.rows.push(location);
    return location;
  }
}

// Demo operation (TE-04), only for tests of the operations engine; no product code.
export const LOCATION_NAME_MAX = 80;

export interface Location {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
}

/** Persistence port; the adapter (TE-02) enforces uniqueness per user. */
export interface LocationStore {
  create(userId: string, name: string): Promise<Location | "name_taken">;
}

const inputSchema = shape({ name: textField("name", { min: 1, max: LOCATION_NAME_MAX }) });

/** Example operation (TE-04): shows validation, access, idempotency and error codes. Real domain logic follows in BES. */
export const locationCreate = (store: LocationStore) =>
  defineOperation({
    name: "location.create",
    schema: inputSchema,
    run: async (context, input) => {
      const r = await store.create(context.userId, input.name);
      return r === "name_taken" ? failed(appError("location.name_taken")) : ok(r);
    },
  });
