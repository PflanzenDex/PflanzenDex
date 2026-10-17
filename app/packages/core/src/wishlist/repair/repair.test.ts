import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { wishCandidates, wishRemove, wishRename } from "../index";
import { InMemoryWishes, ZoneStockStub } from "../test-helpers";

// FR-WUN-06 / #303: open wishes without a name key (collided after folding in migration 0020) are shown and can be
// renamed (which sets the key) or deleted. Two accounts: nobody sees or repairs foreign wishes (P-04).
const CAFE = "00000000-0000-4000-8000-00000000a001";
const CAFE_DUP = "00000000-0000-4000-8000-00000000a002";
const FINE = "00000000-0000-4000-8000-00000000a003";
const BOUGHT_DUP = "00000000-0000-4000-8000-00000000a004";
const BENS_DUP = "00000000-0000-4000-8000-00000000b001";
const UNKNOWN = "00000000-0000-4000-8000-00000000f001";
const anna = { userId: "anna" };

let wishes: InMemoryWishes;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const stock = new ZoneStockStub({});

const rename = (wishId: unknown, name: unknown, context = anna) =>
  execute(
    wishRename({ wishes }),
    { idempotency: idem },
    { context, input: { wishId, name }, idempotencyKey: `k${++counter}` },
  );
const remove = (wishId: unknown, context = anna) =>
  execute(
    wishRemove({ wishes }),
    { idempotency: idem },
    { context, input: { wishId }, idempotencyKey: `k${++counter}` },
  );
const list = (userId = "anna") => wishCandidates({ wishes, stock }, userId);
const errorCode = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  wishes = new InMemoryWishes();
  idem = new InMemoryIdempotencyStore();
  wishes.seed("anna", { id: CAFE, name: "Café" });
  wishes.seed("anna", { id: CAFE_DUP, name: "Cafe", keyless: true });
  wishes.seed("anna", { id: FINE, name: "Aloe vera" });
  wishes.seed("anna", { id: BOUGHT_DUP, name: "Gekauft", status: "bought", keyless: true });
  wishes.seed("ben", { id: BENS_DUP, name: "Bens Doppel", keyless: true });
});

describe("FR-WUN-06 #303 the list names open wishes that share a name", () => {
  it("FR-WUN-06 #303 lists the open key-less wishes with a hint that says what to do", async () => {
    const l = await list();
    expect(l.duplicates.map((d) => d.id)).toEqual([CAFE_DUP]);
    expect(l.duplicates[0]).toMatchObject({ name: "Cafe", title: "Cafe" });
    expect(l.duplicateHint?.text).toContain("heißen gleich");
    expect(l.duplicateHint?.nextAction).toMatch(/benenne.*um/i);
  });

  it("FR-WUN-06 #303 without such wishes there is no hint", async () => {
    const l = await list("nobody");
    expect(l.duplicates).toEqual([]);
    expect(l.duplicateHint).toBeNull();
  });

  it("FR-WUN-06 #303 never shows the key-less wishes of another account", async () => {
    expect((await list("ben")).duplicates.map((d) => d.id)).toEqual([BENS_DUP]);
    expect((await list()).duplicates.map((d) => d.id)).not.toContain(BENS_DUP);
  });
});

describe("FR-WUN-06 #303 rename a duplicate", () => {
  it("FR-WUN-06 #303 renames it, which sets the key: the wish leaves the exempt group", async () => {
    const r = await rename(CAFE_DUP, "Cafe au lait");
    expect(r).toMatchObject({ ok: true, value: { wish: { id: CAFE_DUP, name: "Cafe au lait" } } });
    expect((await list()).duplicates).toEqual([]);
    expect(wishes.rows.find((w) => w.id === CAFE_DUP)?.keyless).toBeFalsy();
  });

  it("FR-WUN-06 #303 a name that is taken still is refused and nothing changes", async () => {
    expect(errorCode(await rename(CAFE_DUP, "CAFÉ"))).toBe("wish.name_taken");
    expect(wishes.rows.find((w) => w.id === CAFE_DUP)?.name).toBe("Cafe");
  });

  it("FR-WUN-06 #303 keeping the same name is refused too: the duplicate stays a duplicate", async () => {
    expect(errorCode(await rename(CAFE_DUP, "Cafe"))).toBe("wish.name_taken");
  });

  it("FR-WUN-06 #303 an empty or missing name writes nothing", async () => {
    expect(errorCode(await rename(CAFE_DUP, "  "))).toBe("input.invalid");
    expect(errorCode(await rename("not-an-id", "Neu"))).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });

  it("FR-WUN-06 #303 a wish that is no duplicate cannot be renamed here", async () => {
    expect(errorCode(await rename(FINE, "Aloe arborescens"))).toBe("wish.not_duplicate");
    expect(wishes.rows.find((w) => w.id === FINE)?.name).toBe("Aloe vera");
  });

  it("FR-WUN-06 #303 a wish of another account looks unknown and stays untouched", async () => {
    expect(errorCode(await rename(BENS_DUP, "Mein"))).toBe("wish.not_found");
    expect(errorCode(await rename(UNKNOWN, "Mein"))).toBe("wish.not_found");
    expect(wishes.rows.find((w) => w.id === BENS_DUP)?.name).toBe("Bens Doppel");
  });

  it("FR-WUN-06 #303 the same Idempotency-Key writes once", async () => {
    const input = { wishId: CAFE_DUP, name: "Cafe au lait" };
    const ctx = { idempotency: idem };
    const op = wishRename({ wishes });
    await execute(op, ctx, { context: anna, input, idempotencyKey: "same" });
    const before = wishes.writes;
    await execute(op, ctx, { context: anna, input, idempotencyKey: "same" });
    expect(wishes.writes).toBe(before);
  });
});

describe("FR-WUN-06 #303 delete a duplicate", () => {
  it("FR-WUN-06 #303 deletes the duplicate and keeps the other wish", async () => {
    const r = await remove(CAFE_DUP);
    expect(r).toMatchObject({ ok: true, value: { removed: { id: CAFE_DUP } } });
    expect(wishes.rows.map((w) => w.id)).toContain(CAFE);
    expect(wishes.rows.map((w) => w.id)).not.toContain(CAFE_DUP);
    expect((await list()).duplicates).toEqual([]);
  });

  it("FR-WUN-06 #303 a wish that is no duplicate is not deleted", async () => {
    expect(errorCode(await remove(FINE))).toBe("wish.not_duplicate");
    expect(errorCode(await remove(CAFE))).toBe("wish.not_duplicate");
    expect(wishes.rows.map((w) => w.id)).toContain(FINE);
  });

  it("FR-WUN-06 #303 a wish of another account looks unknown and stays", async () => {
    expect(errorCode(await remove(BENS_DUP))).toBe("wish.not_found");
    expect(errorCode(await remove(UNKNOWN))).toBe("wish.not_found");
    expect(wishes.rows.map((w) => w.id)).toContain(BENS_DUP);
  });

  it("FR-WUN-06 #303 an invalid id writes nothing", async () => {
    expect(errorCode(await remove(42))).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });
});
