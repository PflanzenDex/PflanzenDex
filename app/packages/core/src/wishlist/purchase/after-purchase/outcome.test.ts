import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import {
  wishBought,
  wishBuy,
  wishCandidates,
  wishDiscard,
  wishDiscarded,
  wishLinkSpecimen,
} from "../../index";
import { InMemoryWishes, ZoneStockStub } from "../../test-helpers";

// US-WUN-05: from the purchase to the plant: the wish is linked to the specimen, "Discarded" is an action.
const ALOE = "00000000-0000-4000-8000-00000000a001";
const CEREUS = "00000000-0000-4000-8000-00000000a002";
const OPEN = "00000000-0000-4000-8000-00000000a003";
const BENS = "00000000-0000-4000-8000-00000000b001";
const SPEC_A = "00000000-0000-4000-8000-0000000c0001";
const SPEC_B = "00000000-0000-4000-8000-0000000c0002";
const SPEC_BEN = "00000000-0000-4000-8000-0000000c00b1";
const UNKNOWN = "00000000-0000-4000-8000-00000000f001";
const anna = { userId: "anna" };

let wishes: InMemoryWishes;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const stock = new ZoneStockStub({});

type Context = { userId: string | null };
const discard = (wishId: unknown, context: Context = anna) =>
  execute(
    wishDiscard({ wishes }),
    { idempotency: idem },
    { context, input: { wishId }, idempotencyKey: `k${++counter}` },
  );
const link = (wishId: unknown, specimenId: unknown, context: Context = anna) =>
  execute(
    wishLinkSpecimen({ wishes }),
    { idempotency: idem },
    { context, input: { wishId, specimenId }, idempotencyKey: `k${++counter}` },
  );
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);
const row = (id: string) => wishes.rows.find((r) => r.id === id);

beforeEach(() => {
  wishes = new InMemoryWishes();
  idem = new InMemoryIdempotencyStore();
  wishes.seed("anna", { id: ALOE, name: "Aloe vera", german: "Echte Aloe", status: "bought" });
  wishes.seed("anna", { id: CEREUS, name: "Cereus", status: "bought" });
  wishes.seed("anna", { id: OPEN, name: "Haworthia" });
  wishes.seed("ben", { id: BENS, name: "Bens Wunsch", status: "bought" });
  wishes.specimens["anna"] = [SPEC_A, SPEC_B];
  wishes.specimens["ben"] = [SPEC_BEN];
});

describe("US-WUN-05 the wishlist entry is linked to the specimen (bought -> specimen)", () => {
  it("US-WUN-05 a bought wish is linked to the specimen it became", async () => {
    const r = await link(ALOE, SPEC_A);
    expect(r).toMatchObject({ ok: true, value: { changed: true, wish: { specimenId: SPEC_A } } });
    expect(row(ALOE)?.specimenId).toBe(SPEC_A);
  });

  it("US-WUN-05 the link is visible in the history of bought wishes", async () => {
    await link(ALOE, SPEC_A);
    const history = await wishBought({ wishes }, "anna");
    expect(history.bought).toEqual([
      { id: ALOE, name: "Aloe vera", title: "Echte Aloe (Aloe vera)", specimenId: SPEC_A },
      { id: CEREUS, name: "Cereus", title: "Cereus", specimenId: null },
    ]);
  });

  it("US-WUN-05 linking the same specimen again changes nothing (idempotent)", async () => {
    await link(ALOE, SPEC_A);
    const writes = wishes.writes;
    const r = await link(ALOE, SPEC_A);
    expect(r).toMatchObject({ ok: true, value: { changed: false } });
    expect(wishes.writes).toBe(writes);
  });

  it("US-WUN-05 says what happened (P-10)", async () => {
    const r = await link(ALOE, SPEC_A);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.hint.text).toContain("Echte Aloe (Aloe vera)");
    expect(r.value.hint.text).toContain("Exemplar");
  });

  it("US-WUN-05 a wish keeps its first specimen: another one is wish.already_linked", async () => {
    await link(ALOE, SPEC_A);
    expect(code(await link(ALOE, SPEC_B))).toBe("wish.already_linked");
    expect(row(ALOE)?.specimenId).toBe(SPEC_A);
  });

  it("US-WUN-05 a specimen belongs to one wish only", async () => {
    await link(ALOE, SPEC_A);
    expect(code(await link(CEREUS, SPEC_A))).toBe("wish.already_linked");
    expect(row(CEREUS)?.specimenId).toBeNull();
  });

  it("US-WUN-05 only a bought wish is linked: an open one is wish.not_bought", async () => {
    expect(code(await link(OPEN, SPEC_A))).toBe("wish.not_bought");
    expect(row(OPEN)?.specimenId).toBeNull();
  });

  it("US-WUN-05 an unknown wish is wish.not_found, an unknown specimen specimen.not_found, bad ids input.invalid", async () => {
    expect(code(await link(UNKNOWN, SPEC_A))).toBe("wish.not_found");
    expect(code(await link(ALOE, UNKNOWN))).toBe("specimen.not_found");
    expect(code(await link("aloe", SPEC_A))).toBe("input.invalid");
    expect(code(await link(ALOE, "x"))).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });

  it("US-WUN-05 the same Idempotency-Key replays the first answer (US-QS-03)", async () => {
    const op = wishLinkSpecimen({ wishes });
    const call = () =>
      execute(
        op,
        { idempotency: idem },
        { context: anna, input: { wishId: ALOE, specimenId: SPEC_A }, idempotencyKey: "same" },
      );
    const first = await call();
    expect(await call()).toEqual(first);
    expect(wishes.writes).toBe(1);
  });

  it("US-WUN-05 without sign-in nothing is linked", async () => {
    expect(code(await link(ALOE, SPEC_A, { userId: null }))).toBe("access.not_signed_in");
  });

  it("US-WUN-05 a wish or specimen of another account looks like an unknown one (P-04)", async () => {
    expect(code(await link(BENS, SPEC_BEN, anna))).toBe("wish.not_found");
    expect(code(await link(ALOE, SPEC_BEN, anna))).toBe("specimen.not_found");
    expect(row(BENS)?.specimenId).toBeNull();
    expect(row(ALOE)?.specimenId).toBeNull();
  });
});

describe("US-WUN-05 'Discarded' can be set by an action", () => {
  it("US-WUN-05 an open wish becomes discarded and leaves the candidate list", async () => {
    const r = await discard(OPEN);
    expect(r).toMatchObject({ ok: true, value: { changed: true, wish: { status: "discarded" } } });
    expect((await wishCandidates({ wishes, stock }, "anna")).candidates).toEqual([]);
  });

  it("US-WUN-05 a discarded wish is kept and readable, nothing disappears silently (P-10)", async () => {
    await discard(OPEN);
    expect(row(OPEN)).toBeDefined();
    const list = await wishDiscarded({ wishes }, "anna");
    expect(list.discarded).toEqual([{ id: OPEN, name: "Haworthia", title: "Haworthia" }]);
    expect(list.hint.text).toContain("1");
  });

  it("US-WUN-05 says what happened and that the wish is kept", async () => {
    const r = await discard(OPEN);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.hint.text).toContain("Haworthia");
    expect(r.value.hint.text).toContain("verworfen");
    expect(r.value.hint.nextAction.length).toBeGreaterThan(0);
  });

  it("US-WUN-05 discarding again changes nothing and says so (idempotent)", async () => {
    await discard(OPEN);
    const writes = wishes.writes;
    const r = await discard(OPEN);
    expect(r).toMatchObject({ ok: true, value: { changed: false } });
    expect(wishes.writes).toBe(writes);
  });

  it("US-WUN-05 a bought wish cannot be discarded: wish.already_bought, it stays bought", async () => {
    expect(code(await discard(ALOE))).toBe("wish.already_bought");
    expect(row(ALOE)?.status).toBe("bought");
  });

  it("US-WUN-05 an unknown wish is wish.not_found, an invalid id input.invalid", async () => {
    expect(code(await discard(UNKNOWN))).toBe("wish.not_found");
    expect(code(await discard("x"))).toBe("input.invalid");
  });

  it("US-WUN-05 without sign-in nothing is discarded", async () => {
    expect(code(await discard(OPEN, { userId: null }))).toBe("access.not_signed_in");
    expect(row(OPEN)?.status).toBe("wishlist");
  });

  it("US-WUN-05 a wish of another account looks like an unknown one and stays open (P-04)", async () => {
    wishes.seed("ben", { id: "00000000-0000-4000-8000-00000000b002", name: "Bens offener" });
    expect(code(await discard("00000000-0000-4000-8000-00000000b002", anna))).toBe(
      "wish.not_found",
    );
    expect((await wishDiscarded({ wishes }, "ben")).discarded).toEqual([]);
  });

  it("US-WUN-05 an empty list of discarded wishes says so and what to do next (P-09)", async () => {
    const { discarded, hint } = await wishDiscarded({ wishes }, "anna");
    expect(discarded).toEqual([]);
    expect(hint.text).toContain("Kein Wunsch");
    expect(hint.nextAction.length).toBeGreaterThan(0);
  });
});

describe("US-WUN-05 the way to the plant", () => {
  it("US-WUN-05 after 'Bought' the next action offers to create the specimen with the wish name", async () => {
    const r = await execute(
      wishBuy({ wishes }),
      { idempotency: idem },
      { context: anna, input: { wishId: OPEN }, idempotencyKey: "buy" },
    );
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.hint.nextAction).toContain("Exemplar");
    expect(r.value.wish.specimenId).toBeNull();
  });
});
