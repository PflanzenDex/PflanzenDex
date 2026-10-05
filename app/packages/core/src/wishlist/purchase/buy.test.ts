import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { wishBought, wishBuy, wishCandidates } from "../index";
import { InMemoryWishes, ZoneStockStub } from "../test-helpers";

// US-WUN-03: "Bought" sets the status and hides the candidate from the list; it stays in the history.
const ALOE = "00000000-0000-4000-8000-00000000a001";
const CEREUS = "00000000-0000-4000-8000-00000000a002";
const DROPPED = "00000000-0000-4000-8000-00000000a003";
const BENS = "00000000-0000-4000-8000-00000000b001";
const UNKNOWN = "00000000-0000-4000-8000-00000000f001";
const anna = { userId: "anna" };
const ben = { userId: "ben" };

let wishes: InMemoryWishes;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const stock = new ZoneStockStub({});

const buy = (wishId: unknown, context: { userId: string | null } = anna, key = `k${++counter}`) =>
  execute(
    wishBuy({ wishes }),
    { idempotency: idem },
    { context, input: { wishId }, idempotencyKey: key },
  );
const statusOf = (id: string) => wishes.rows.find((r) => r.id === id)?.status;
const openNames = async (userId = "anna") =>
  (await wishCandidates({ wishes, stock }, userId)).candidates.map((c) => c.name);
const errorOf = (r: Awaited<ReturnType<typeof buy>>) => (r.ok ? null : r.error);

beforeEach(() => {
  wishes = new InMemoryWishes();
  idem = new InMemoryIdempotencyStore();
  wishes.seed("anna", { id: ALOE, name: "Aloe vera", german: "Echte Aloe" });
  wishes.seed("anna", { id: CEREUS, name: "Cereus" });
  wishes.seed("anna", { id: DROPPED, name: "Verworfen", status: "discarded" });
  wishes.seed("ben", { id: BENS, name: "Bens Geheimtipp" });
});

describe("US-WUN-03 record a purchase", () => {
  it("US-WUN-03 'Bought' sets the status bought", async () => {
    const r = await buy(ALOE);
    expect(r).toMatchObject({ ok: true, value: { changed: true, wish: { status: "bought" } } });
    expect(statusOf(ALOE)).toBe("bought");
  });

  it("US-WUN-03 a bought wish is hidden from the candidate list, the others stay", async () => {
    await buy(ALOE);
    expect(await openNames()).toEqual(["Cereus"]);
  });

  it("US-WUN-03 a bought wish stays in the history (nothing is deleted, P-10)", async () => {
    await buy(ALOE);
    const history = await wishBought({ wishes }, "anna");
    expect(history.bought).toEqual([
      { id: ALOE, name: "Aloe vera", title: "Echte Aloe (Aloe vera)" },
    ]);
    expect(wishes.rows.map((w) => w.id)).toContain(ALOE);
  });

  it("US-WUN-03 says what happened and what to do next (P-09)", async () => {
    const r = await buy(ALOE);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.hint.text).toContain("Echte Aloe (Aloe vera)");
    expect(r.value.hint.text).toContain("Gekauft");
    expect(r.value.hint.nextAction).toContain("Exemplar");
  });

  it("US-WUN-03 buying an already bought wish again changes nothing and says so (idempotent)", async () => {
    await buy(ALOE);
    const writes = wishes.writes;
    const r = await buy(ALOE);
    expect(r).toMatchObject({ ok: true, value: { changed: false, wish: { status: "bought" } } });
    if (r.ok) expect(r.value.hint.text).toContain("schon");
    expect(wishes.writes).toBe(writes);
  });

  it("US-WUN-03 the same Idempotency-Key replays the first answer (US-QS-03)", async () => {
    const first = await buy(ALOE, anna, "same");
    const second = await buy(ALOE, anna, "same");
    expect(second).toEqual(first);
    expect(wishes.writes).toBe(1);
  });

  it("US-WUN-03 only an open wish can be bought: a discarded one is refused with wish.not_open, nothing changes", async () => {
    const r = await buy(DROPPED);
    expect(errorOf(r)?.code).toBe("wish.not_open");
    expect(statusOf(DROPPED)).toBe("discarded");
  });

  it("US-WUN-03 an unknown wish is wish.not_found, an invalid id input.invalid", async () => {
    expect(errorOf(await buy(UNKNOWN))?.code).toBe("wish.not_found");
    expect(errorOf(await buy("aloe"))?.code).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });

  it("US-WUN-03 without sign-in nothing is bought", async () => {
    expect(errorOf(await buy(ALOE, { userId: null }))?.code).toBe("access.not_signed_in");
    expect(statusOf(ALOE)).toBe("wishlist");
  });
});

describe("US-WUN-03 tenant isolation (P-04, P-05)", () => {
  it("US-WUN-03 a wish of another account looks like an unknown one and stays open", async () => {
    expect(errorOf(await buy(BENS, anna))?.code).toBe("wish.not_found");
    expect(statusOf(BENS)).toBe("wishlist");
    expect(await openNames("ben")).toEqual(["Bens Geheimtipp"]);
  });

  it("US-WUN-03 the history shows only the own bought wishes", async () => {
    await buy(ALOE, anna);
    await buy(BENS, ben);
    expect((await wishBought({ wishes }, "anna")).bought.map((w) => w.name)).toEqual(["Aloe vera"]);
    expect((await wishBought({ wishes }, "ben")).bought.map((w) => w.name)).toEqual([
      "Bens Geheimtipp",
    ]);
    expect((await wishBought({ wishes }, "carla")).bought).toEqual([]);
  });
});

describe("US-WUN-03 the history of bought wishes", () => {
  it("US-WUN-03 open and discarded wishes are not in the history", async () => {
    expect((await wishBought({ wishes }, "anna")).bought).toEqual([]);
  });

  it("US-WUN-03 an empty history says so and what to do next (P-09)", async () => {
    const { hint } = await wishBought({ wishes }, "anna");
    expect(hint.text).toBe("Noch kein Wunsch ist als gekauft vermerkt.");
    expect(hint.nextAction).toContain("Gekauft");
  });

  it("US-WUN-03 a history with entries names the count and points to the specimen", async () => {
    await buy(ALOE);
    await buy(CEREUS);
    const history = await wishBought({ wishes }, "anna");
    expect(history.bought.map((w) => w.name)).toEqual(["Aloe vera", "Cereus"]);
    expect(history.hint.text).toBe("2 Wünsche sind als gekauft vermerkt.");
    expect(history.hint.nextAction).toContain("Exemplar");
  });
});
