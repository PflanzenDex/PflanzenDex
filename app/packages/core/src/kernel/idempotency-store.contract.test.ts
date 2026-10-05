import { describe, expect, it } from "vitest";
import type { IdempotencyKey, IdempotencyStore } from "./ports";
import { InMemoryIdempotencyStore } from "./test-helpers";

const key = (k = "k1", userId = "u1"): IdempotencyKey => ({ userId, operation: "op", key: k });

/** Contract of the port `IdempotencyStore` (ADR 0003): every adapter must pass these cases. */
export function idempotencyStoreContract(name: string, make: () => IdempotencyStore) {
  describe(`IdempotencyStore contract · ${name}`, () => {
    it("the first call with a key is fresh, a second one with the same fingerprint is running", async () => {
      const store = make();
      expect(await store.begin(key(), "f")).toEqual({ kind: "fresh" });
      expect(await store.begin(key(), "f")).toEqual({ kind: "running" });
    });

    it("a completed key repeats its serializable result", async () => {
      const store = make();
      await store.begin(key(), "f");
      await store.complete(key(), { id: "x" });
      expect(await store.begin(key(), "f")).toEqual({ kind: "repeat", result: { id: "x" } });
    });

    it("the same key with another fingerprint is a conflict", async () => {
      const store = make();
      await store.begin(key(), "f");
      expect(await store.begin(key(), "other")).toEqual({ kind: "conflict" });
    });

    it("a discarded key can be used again", async () => {
      const store = make();
      await store.begin(key(), "f");
      await store.discard(key());
      expect(await store.begin(key(), "f")).toEqual({ kind: "fresh" });
    });

    it("keys of two accounts do not collide (P-04)", async () => {
      const store = make();
      await store.begin(key("k1", "u1"), "f");
      expect(await store.begin(key("k1", "u2"), "f")).toEqual({ kind: "fresh" });
    });
  });
}

idempotencyStoreContract("in-memory adapter", () => new InMemoryIdempotencyStore());
