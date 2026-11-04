import type { Context, Handler } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthEnv } from "./auth-env";
import { readOnly, sharedFindMany, sharedReads } from "./read-scope";

// NFR-12 (issue #1240): the reads of one GET request are answered once, per account, and never across requests.
// The scope is opened by `readOnly`, the same wrapper the GET handlers use.
const inRequest = <T>(body: () => Promise<T>): Promise<T> =>
  readOnly((() => body()) as unknown as Handler<AuthEnv>)(
    {} as Context<AuthEnv>,
    async () => undefined,
  ) as unknown as Promise<T>;

describe("NFR-12 reads of one request are answered once", () => {
  it("NFR-12 a list read twice at the same time in one request is sent once and shared", async () => {
    const calls: string[] = [];
    const reads = sharedReads(
      {
        async list(userId: string) {
          calls.push(userId);
          await Promise.resolve();
          return [userId];
        },
      },
      "specimen",
      ["list"],
    );
    await inRequest(async () => {
      const [a, b] = await Promise.all([reads.list("anna"), reads.list("anna")]);
      expect(a).toBe(b);
    });
    expect(calls).toEqual(["anna"]);
  });

  it("NFR-12 another account is loaded on its own within the same request (P-04)", async () => {
    const calls: string[] = [];
    const reads = sharedReads(
      {
        async list(userId: string) {
          calls.push(userId);
          return [userId];
        },
      },
      "specimen",
      ["list"],
    );
    await inRequest(async () => {
      expect(await reads.list("anna")).toEqual(["anna"]);
      expect(await reads.list("ben")).toEqual(["ben"]);
      expect(await reads.list("anna")).toEqual(["anna"]);
    });
    expect(calls).toEqual(["anna", "ben"]);
  });

  it("NFR-12 the next request starts without the reads of the last one", async () => {
    const calls: string[] = [];
    const reads = sharedReads(
      {
        async list(userId: string) {
          calls.push(userId);
          return [userId];
        },
      },
      "specimen",
      ["list"],
    );
    await inRequest(() => reads.list("anna"));
    await inRequest(() => reads.list("anna"));
    expect(calls).toEqual(["anna", "anna"]);
  });

  it("NFR-12 outside a GET request every call goes to the adapter", async () => {
    const calls: string[] = [];
    const reads = sharedReads(
      {
        async list(userId: string) {
          calls.push(userId);
          return [userId];
        },
      },
      "specimen",
      ["list"],
    );
    await reads.list("anna");
    await reads.list("anna");
    expect(calls).toEqual(["anna", "anna"]);
  });

  it("NFR-12 a failed read reaches its caller and is not kept: a later read of the request tries again", async () => {
    const calls: string[] = [];
    let fail = true;
    const reads = sharedReads(
      {
        async list(userId: string) {
          calls.push(userId);
          if (fail) {
            fail = false;
            throw new Error("connection lost");
          }
          return [userId];
        },
      },
      "zone",
      ["list"],
    );
    await inRequest(async () => {
      await expect(reads.list("anna")).rejects.toThrow("connection lost");
      expect(await reads.list("anna")).toEqual(["anna"]);
    });
    expect(calls).toEqual(["anna", "anna"]);
  });

  it("NFR-12 the wrapper keeps the adapter: its other methods and its state are the adapter's own", async () => {
    class Adapter {
      constructor(private readonly store: string) {}
      async list(userId: string) {
        return [`${this.store}:${userId}`];
      }
      name() {
        return this.store;
      }
    }
    const wrapped = sharedReads(new Adapter("db"), "specimen", ["list"]);
    expect(wrapped).toBeInstanceOf(Adapter);
    expect(wrapped.name()).toBe("db");
    expect(await wrapped.list("anna")).toEqual(["db:anna"]);
  });
});

describe("NFR-12 findMany asks only for the species the request has not read", () => {
  type Species = { id: string };
  const store = (asked: string[][], failOnce = false) => {
    let fail = failOnce;
    return {
      async findMany(_userId: string, ids: readonly string[]) {
        asked.push([...ids]);
        if (fail) {
          fail = false;
          throw new Error("connection lost");
        }
        return ids.map((id): Species | null => (id === "unknown" ? null : { id }));
      },
    };
  };

  it("NFR-12 known ids are not asked again; the missing ones go in one statement, in the order asked", async () => {
    const asked: string[][] = [];
    const species = sharedFindMany(store(asked), "species");
    await inRequest(async () => {
      expect(await species.findMany("anna", ["a", "b"])).toEqual([{ id: "a" }, { id: "b" }]);
      expect(await species.findMany("anna", ["b", "c", "unknown"])).toEqual([
        { id: "b" },
        { id: "c" },
        null,
      ]);
    });
    expect(asked).toEqual([
      ["a", "b"],
      ["c", "unknown"],
    ]);
  });

  it("NFR-12 overlapping reads at the same time load each species once", async () => {
    const asked: string[][] = [];
    const species = sharedFindMany(store(asked), "species");
    await inRequest(async () => {
      const [x, y] = await Promise.all([
        species.findMany("anna", ["a"]),
        species.findMany("anna", ["a", "b"]),
      ]);
      expect(x).toEqual([{ id: "a" }]);
      expect(y).toEqual([{ id: "a" }, { id: "b" }]);
    });
    expect(asked.flat().filter((id) => id === "a")).toEqual(["a"]);
  });

  it("NFR-12 another account asks for the same species again (P-04)", async () => {
    const asked: string[][] = [];
    const species = sharedFindMany(store(asked), "species");
    await inRequest(async () => {
      await species.findMany("anna", ["a"]);
      await species.findMany("ben", ["a"]);
    });
    expect(asked).toEqual([["a"], ["a"]]);
  });

  it("NFR-12 a failed statement reaches its caller and its ids are read again later in the request", async () => {
    const asked: string[][] = [];
    const species = sharedFindMany(store(asked, true), "species");
    await inRequest(async () => {
      await expect(species.findMany("anna", ["a"])).rejects.toThrow("connection lost");
      expect(await species.findMany("anna", ["a"])).toEqual([{ id: "a" }]);
    });
    expect(asked).toEqual([["a"], ["a"]]);
  });

  it("NFR-12 outside a GET request findMany is the adapter's own call", async () => {
    const asked: string[][] = [];
    const species = sharedFindMany(store(asked), "species");
    await species.findMany("anna", ["a"]);
    await species.findMany("anna", ["a"]);
    expect(asked).toEqual([["a"], ["a"]]);
  });
});
