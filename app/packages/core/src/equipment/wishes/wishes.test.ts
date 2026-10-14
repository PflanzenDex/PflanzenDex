import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  equipmentWishBuy,
  equipmentWishCreate,
  equipmentWishDiscard,
  equipmentWishes,
} from "./index";
import { InMemoryEquipmentWishes } from "./test-helpers";

// US-EQU-08: wishes of type equipment; "Bought" hands name, product id, type and price to the equipment form.
const anna = { userId: "anna" };
const ben = { userId: "ben" };
let wishes: InMemoryEquipmentWishes;
let idem: InMemoryIdempotencyStore;
let n = 0;

const run = <E, A>(
  op: Parameters<typeof execute<E, A>>[0],
  input: unknown,
  context: { userId: string | null } = anna,
) => execute(op, { idempotency: idem }, { context, input, idempotencyKey: `k${++n}` });
const create = (input: unknown, context = anna) =>
  run(equipmentWishCreate({ wishes }), input, context);
const buy = (wishId: unknown, context = anna) =>
  run(equipmentWishBuy({ wishes }), { wishId }, context);
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  wishes = new InMemoryEquipmentWishes();
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-08 record an equipment wish", () => {
  it("US-EQU-08 type and name are enough; product id and price stay unknown (P-08)", async () => {
    const r = await create({ equipmentType: "Lamp", name: "Growlight X" });
    expect(r).toMatchObject({
      ok: true,
      value: { status: "wishlist", productId: null, priceEur: null, equipmentType: "Lamp" },
    });
  });

  it("US-EQU-08 a missing type or name is refused and nothing is written", async () => {
    expect(errorOf(await create({ name: "x" }))).toBe("input.invalid");
    expect(errorOf(await create({ equipmentType: "Lamp" }))).toBe("input.invalid");
    expect(errorOf(await create({ equipmentType: "Gizmo", name: "x" }))).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });

  it("US-EQU-08 a product id that is a URL and a price with fractions of a cent are refused", async () => {
    expect(
      errorOf(
        await create({ equipmentType: "Lamp", name: "A", productId: "https://shop.example/x" }),
      ),
    ).toBe("input.invalid");
    expect(errorOf(await create({ equipmentType: "Lamp", name: "A", priceEur: 1.234 }))).toBe(
      "input.invalid",
    );
  });

  it("US-EQU-08 the name is unique among the wishes of the account, folded (FR-WUN-06)", async () => {
    await create({ equipmentType: "Lamp", name: "Growlight X" });
    expect(errorOf(await create({ equipmentType: "Pot", name: "growlight  x" }))).toBe(
      "wish.name_taken",
    );
    expect((await create({ equipmentType: "Lamp", name: "Growlight X" }, ben)).ok).toBe(true);
  });
});

describe("US-EQU-08 Bought", () => {
  it("US-EQU-08 'Bought' sets the status and returns name, product id, type and price as prefill", async () => {
    const made = await create({
      equipmentType: "Timer",
      name: "Zeitschaltuhr",
      productId: "ZS-100",
      priceEur: 12.5,
    });
    const id = made.ok ? made.value.id : "";
    const r = await buy(id);
    expect(r).toMatchObject({
      ok: true,
      value: {
        changed: true,
        wish: { status: "bought" },
        prefill: { type: "Timer", name: "Zeitschaltuhr", productId: "ZS-100", priceEur: 12.5 },
      },
    });
  });

  it("US-EQU-08 without a price the prefill has none: nothing is invented (P-08)", async () => {
    const made = await create({ equipmentType: "Pot", name: "Topf" });
    const r = await buy(made.ok ? made.value.id : "");
    expect(r).toMatchObject({ ok: true, value: { prefill: { productId: null, priceEur: null } } });
  });

  it("US-EQU-08 a second 'Bought' changes nothing; a discarded wish stays discarded", async () => {
    const a = await create({ equipmentType: "Pot", name: "Topf" });
    const b = await create({ equipmentType: "Pot", name: "Topf 2" });
    const idA = a.ok ? a.value.id : "";
    const idB = b.ok ? b.value.id : "";
    await buy(idA);
    const writes = wishes.writes;
    expect(await buy(idA)).toMatchObject({ ok: true, value: { changed: false } });
    expect(wishes.writes).toBe(writes);
    await run(equipmentWishDiscard({ wishes }), { wishId: idB });
    expect(errorOf(await buy(idB))).toBe("wish.not_open");
  });

  it("US-EQU-08 a foreign wish looks like an unknown one (P-04)", async () => {
    const made = await create({ equipmentType: "Pot", name: "Topf" });
    expect(errorOf(await buy(made.ok ? made.value.id : "", ben))).toBe("wish.not_found");
  });
});

describe("US-EQU-08 lists", () => {
  it("US-EQU-08 equipment wishes are listed by status; bought and discarded ones stay readable (P-10)", async () => {
    const a = await create({ equipmentType: "Pot", name: "Topf" });
    await create({ equipmentType: "Lamp", name: "Lampe" });
    await buy(a.ok ? a.value.id : "");
    const list = await equipmentWishes({ wishes }, "anna");
    expect(list.open.map((w) => w.name)).toEqual(["Lampe"]);
    expect(list.bought.map((w) => w.name)).toEqual(["Topf"]);
    expect((await equipmentWishes({ wishes }, "ben")).open).toEqual([]);
  });
});
