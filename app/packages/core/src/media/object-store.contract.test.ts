import { describe, expect, it } from "vitest";
import { InMemoryObjectStore } from "./object-store.fake";
import type { ObjectStore } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const bytes = (...n: number[]) => new Uint8Array(n);

/** Contract of the port `ObjectStore` (ADR 0003): every adapter must pass these cases (TE-05, QG-D3, P-04). */
export function objectStoreContract(name: string, make: () => ObjectStore | Promise<ObjectStore>) {
  describe(`ObjectStore contract · ${name}`, () => {
    it("TE-05 put, exists, get and delete round-trip the bytes and the content type", async () => {
      const s = await make();
      expect(await s.put(A, "p1.webp", bytes(1, 2, 3), "image/webp")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(await s.exists(A, "p1.webp")).toEqual({ ok: true, value: true });
      const got = await s.get(A, "p1.webp");
      expect(got.ok && [...got.value.bytes]).toEqual([1, 2, 3]);
      expect(got.ok && got.value.contentType).toBe("image/webp");
      expect((await s.delete(A, "p1.webp")).ok).toBe(true);
      expect(await s.exists(A, "p1.webp")).toEqual({ ok: true, value: false });
      const gone = await s.get(A, "p1.webp");
      expect(!gone.ok && gone.error.code).toBe("media.not_found");
    });

    it("TE-05 deleting a missing object succeeds (idempotent)", async () => {
      const s = await make();
      expect((await s.delete(A, "never.webp")).ok).toBe(true);
    });

    it("US-ACC-04 deleteAll removes every object of the account and nothing of another, and repeats harmlessly", async () => {
      const s = await make();
      await s.put(A, "one.webp", bytes(1), "image/webp");
      await s.put(A, "two.webp", bytes(2), "image/webp");
      await s.put(B, "keep.webp", bytes(3), "image/webp");
      expect(await s.deleteAll(A)).toEqual({ ok: true, value: 2 });
      expect(await s.exists(A, "one.webp")).toEqual({ ok: true, value: false });
      expect(await s.exists(B, "keep.webp")).toEqual({ ok: true, value: true });
      expect(await s.deleteAll(A)).toEqual({ ok: true, value: 0 });
      const bad = await s.deleteAll("../" + B);
      expect(!bad.ok && bad.error.code).toBe("media.name_invalid");
      await s.deleteAll(B);
    });

    it("TE-05 put refuses a content type that is not an image type and an oversize object", async () => {
      const s = await make();
      const type = await s.put(A, "p.webp", bytes(1), "text/html");
      expect(!type.ok && type.error.code).toBe("media.type_unsupported");
      const big = await s.put(A, "p.webp", new Uint8Array(6 * 1024 * 1024), "image/webp");
      expect(!big.ok && big.error.code).toBe("media.too_large");
      expect(await s.exists(A, "p.webp")).toEqual({ ok: true, value: false });
    });

    it("QG-D3 account A cannot read, probe or delete the object of account B with the same name", async () => {
      const s = await make();
      await s.put(B, "secret.webp", bytes(9), "image/webp");
      const read = await s.get(A, "secret.webp");
      expect(!read.ok && read.error.code).toBe("media.not_found");
      expect(await s.exists(A, "secret.webp")).toEqual({ ok: true, value: false });
      await s.delete(A, "secret.webp");
      const still = await s.get(B, "secret.webp");
      expect(still.ok && [...still.value.bytes]).toEqual([9]);
    });

    it("QG-D3 a name that tries to reach into another account is refused, not resolved", async () => {
      const s = await make();
      await s.put(B, "secret.webp", bytes(9), "image/webp");
      const traversal = `../${B}/secret.webp`;
      for (const r of [
        await s.get(A, traversal),
        await s.put(A, traversal, bytes(1), "image/webp"),
        await s.delete(A, traversal),
        await s.exists(A, traversal),
      ])
        expect(!r.ok && r.error.code).toBe("media.name_invalid");
      const intact = await s.get(B, "secret.webp");
      expect(intact.ok && [...intact.value.bytes]).toEqual([9]);
    });
  });
}

objectStoreContract("in-memory fake", () => new InMemoryObjectStore());
