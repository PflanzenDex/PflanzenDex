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
      expect(await s.put(A, "p1.jpg", bytes(1, 2, 3), "image/jpeg")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(await s.exists(A, "p1.jpg")).toEqual({ ok: true, value: true });
      const got = await s.get(A, "p1.jpg");
      expect(got.ok && [...got.value.bytes]).toEqual([1, 2, 3]);
      expect(got.ok && got.value.contentType).toBe("image/jpeg");
      expect((await s.delete(A, "p1.jpg")).ok).toBe(true);
      expect(await s.exists(A, "p1.jpg")).toEqual({ ok: true, value: false });
      const gone = await s.get(A, "p1.jpg");
      expect(!gone.ok && gone.error.code).toBe("media.not_found");
    });

    it("TE-05 deleting a missing object succeeds (idempotent)", async () => {
      const s = await make();
      expect((await s.delete(A, "never.jpg")).ok).toBe(true);
    });

    it("TE-05 put refuses a content type that is not an image type and an oversize object", async () => {
      const s = await make();
      const type = await s.put(A, "p.jpg", bytes(1), "text/html");
      expect(!type.ok && type.error.code).toBe("media.type_unsupported");
      const big = await s.put(A, "p.jpg", new Uint8Array(6 * 1024 * 1024), "image/jpeg");
      expect(!big.ok && big.error.code).toBe("media.too_large");
      expect(await s.exists(A, "p.jpg")).toEqual({ ok: true, value: false });
    });

    it("QG-D3 account A cannot read, probe or delete the object of account B with the same name", async () => {
      const s = await make();
      await s.put(B, "secret.jpg", bytes(9), "image/jpeg");
      const read = await s.get(A, "secret.jpg");
      expect(!read.ok && read.error.code).toBe("media.not_found");
      expect(await s.exists(A, "secret.jpg")).toEqual({ ok: true, value: false });
      await s.delete(A, "secret.jpg");
      const still = await s.get(B, "secret.jpg");
      expect(still.ok && [...still.value.bytes]).toEqual([9]);
    });

    it("QG-D3 a name that tries to reach into another account is refused, not resolved", async () => {
      const s = await make();
      await s.put(B, "secret.jpg", bytes(9), "image/jpeg");
      const traversal = `../${B}/secret.jpg`;
      for (const r of [
        await s.get(A, traversal),
        await s.put(A, traversal, bytes(1), "image/jpeg"),
        await s.delete(A, traversal),
        await s.exists(A, traversal),
      ])
        expect(!r.ok && r.error.code).toBe("media.name_invalid");
      const intact = await s.get(B, "secret.jpg");
      expect(intact.ok && [...intact.value.bytes]).toEqual([9]);
    });
  });
}

objectStoreContract("in-memory fake", () => new InMemoryObjectStore());
