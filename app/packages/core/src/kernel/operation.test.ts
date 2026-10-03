import { beforeEach, describe, expect, it } from "vitest";
import type { Context } from "./index";
import { defineOperation, failed, appError, execute, shape, ok, textField } from "./index";
import { InMemoryIdempotencyStore, InMemoryLocations, locationCreate } from "./test-helpers";

let idem: InMemoryIdempotencyStore;
let locations: InMemoryLocations;
const user = { userId: "u1" };

const call = (input: unknown, key: string | undefined = "k1", context: Context = user) =>
  execute(
    locationCreate(locations),
    { idempotency: idem },
    { context, input, idempotencyKey: key },
  );

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  locations = new InMemoryLocations();
});

describe("US-QS-03 / FR-KI-02 operations: idempotency", () => {
  it("creates exactly one entry for valid input", async () => {
    const r = await call({ name: "  Fensterbank " });
    expect(r.ok && r.value.name).toBe("Fensterbank");
    expect(locations.rows).toHaveLength(1);
  });

  it("double call with the same key creates no duplicate entry and returns the same result", async () => {
    const first = await call({ name: "Fensterbank" });
    const second = await call({ name: "Fensterbank" });
    expect(second).toEqual(first);
    expect(locations.rows).toHaveLength(1);
    expect(locations.writes).toBe(1);
  });

  it("same key, different input: idempotency.key_conflict, nothing written", async () => {
    await call({ name: "A" });
    const r = await call({ name: "B" });
    expect(!r.ok && r.error.code).toBe("idempotency.key_conflict");
    expect(locations.rows).toHaveLength(1);
  });

  it("key is separate per user (P-04)", async () => {
    await call({ name: "A" });
    const r = await call({ name: "A" }, "k1", { userId: "u2" });
    expect(r.ok).toBe(true);
    expect(locations.rows).toHaveLength(2);
  });

  it("missing key is rejected", async () => {
    const r = await call({ name: "A" }, "");
    expect(!r.ok && r.error.code).toBe("idempotency.key_missing");
    expect(locations.writes).toBe(0);
  });

  it("running execution with the same key: idempotency.in_progress", async () => {
    await idem.begin({ userId: "u1", operation: "location.create", key: "k1" }, '{"name":"A"}');
    const r = await call({ name: "A" });
    expect(!r.ok && r.error.code).toBe("idempotency.in_progress");
    expect(locations.writes).toBe(0);
  });

  it("domain error releases the key: retry with new input possible", async () => {
    await call({ name: "A" }, "k1");
    const duplicate = await call({ name: "A" }, "k2");
    expect(!duplicate.ok && duplicate.error.code).toBe("location.name_taken");
    const again = await call({ name: "A" }, "k2");
    expect(!again.ok && again.error.code).toBe("location.name_taken");
    expect(locations.rows).toHaveLength(1);
  });

  it("exception in the operation becomes system.unexpected with cause and releases the key", async () => {
    let attempts = 0;
    const op = defineOperation({
      name: "test.kaputt",
      schema: shape({ x: textField("x", { min: 1, max: 5 }) }),
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("db gone");
        return ok(attempts);
      },
    });
    const call = { context: user, input: { x: "a" }, idempotencyKey: "k" };
    const first = await execute(op, { idempotency: idem }, call);
    expect(!first.ok && first.error.code).toBe("system.unexpected");
    expect(!first.ok && first.error.cause).toBeInstanceOf(Error);
    expect((await execute(op, { idempotency: idem }, call)).ok).toBe(true);
  });
});

describe("P-03 operations: invalid input writes nothing", () => {
  it.each([
    [null],
    ["text"],
    [[]],
    [{}],
    [{ name: "" }],
    [{ name: "   " }],
    [{ name: 5 }],
    [{ name: "x".repeat(81) }],
  ])("rejects %j", async (input) => {
    const r = await call(input);
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(locations.writes).toBe(0);
  });

  it("names the faulty field", async () => {
    const r = await call({ name: "" });
    expect(!r.ok && r.error.details).toEqual([{ field: "name", code: "input.invalid" }]);
  });

  it("invalid input does not reserve the idempotency key", async () => {
    await call({ name: "" });
    const r = await call({ name: "Ok" });
    expect(r.ok).toBe(true);
  });

  it("drops unknown fields", async () => {
    const r = await call({ name: "A", userId: "u9" });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(["id", "name", "userId"]);
    expect(locations.rows[0]?.userId).toBe("u1");
  });
});

describe("operations: central access check", () => {
  it("without sign-in: access.not_signed_in, nothing written", async () => {
    const r = await call({ name: "A" }, "k1", { userId: null });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    expect(locations.writes).toBe(0);
  });

  it("additional authorization denied: access.denied", async () => {
    const op = defineOperation({
      name: "test.blocked",
      schema: shape({ x: textField("x", { min: 1, max: 5 }) }),
      authorized: async () => false,
      run: async () => failed(appError("system.unexpected")),
    });
    const r = await execute(
      op,
      { idempotency: idem },
      { context: user, input: { x: "a" }, idempotencyKey: "k" },
    );
    expect(!r.ok && r.error.code).toBe("access.denied");
  });
});
