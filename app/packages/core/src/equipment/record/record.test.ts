import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { equipmentRecord } from "./index";
import { InMemoryEquipment } from "../store/test-helpers";

const ZONE = "00000000-0000-4000-8000-0000000000a1";
const anna = { userId: "anna" };
let equipment: InMemoryEquipment;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const record = (input: unknown, context = anna, key = `k${++counter}`) =>
  execute(
    equipmentRecord({ equipment }),
    { idempotency: idem },
    { context, input, idempotencyKey: key },
  );
const lamp = (extra: Record<string, unknown> = {}) => ({
  type: "Lamp",
  name: "Lampe 3",
  lightZoneId: ZONE,
  ...extra,
});

beforeEach(() => {
  equipment = new InMemoryEquipment({ anna: [ZONE], ben: [ZONE] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-EQU-01 record equipment (DM-EQU-01, P-08, FR-EQU-03)", () => {
  it("US-EQU-01 needs only type and name; everything else stays unknown", async () => {
    const r = await record(lamp());
    expect(r).toMatchObject({
      ok: true,
      value: {
        type: "Lamp",
        name: "Lampe 3",
        status: "active",
        manufacturer: null,
        model: null,
        productId: null,
        priceEur: null,
        boughtAt: null,
        note: null,
        lightZoneId: ZONE,
      },
    });
  });

  it("US-EQU-01 stores all optional fields as given", async () => {
    const r = await record(
      lamp({
        manufacturer: "Acme",
        model: "G-100",
        productId: "4006381333931",
        priceEur: 49.9,
        boughtAt: "2026-03-01",
        note: "Über dem Regal",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { manufacturer: "Acme", priceEur: 49.9, boughtAt: "2026-03-01" },
    });
  });

  it("US-EQU-01 refuses a missing name or type, an unknown type and a date that does not exist", async () => {
    for (const bad of [
      { type: "Lamp" },
      { name: "X" },
      lamp({ type: "Toaster" }),
      lamp({ boughtAt: "2026-02-30" }),
      lamp({ priceEur: -1 }),
      lamp({ priceEur: 1.234 }),
    ]) {
      const r = await record(bad);
      expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
    expect(equipment.writes).toBe(0);
  });

  it("FR-EQU-03 refuses a product id that is a URL", async () => {
    for (const productId of ["https://shop.example/x", "www.shop.example/x"]) {
      const r = await record(lamp({ productId }));
      expect(r).toMatchObject({
        ok: false,
        error: { code: "input.invalid", details: [{ field: "productId" }] },
      });
    }
  });

  it("US-EQU-01 a consumable has no operating status", async () => {
    const r = await record({ type: "Substrate", name: "Kakteenerde" });
    expect(r).toMatchObject({ ok: true, value: { type: "Substrate", status: null } });
  });

  it("US-EQU-01 the name is unique per account, case-insensitive, and a distinction makes it free", async () => {
    await record(lamp());
    expect(await record(lamp({ name: "LAMPE 3" }))).toMatchObject({
      ok: false,
      error: { code: "equipment.name_taken" },
    });
    expect(await record(lamp({ name: "Lampe 3 – Regal 2" }))).toMatchObject({ ok: true });
    expect(await record(lamp(), { userId: "ben" })).toMatchObject({ ok: true });
  });

  it("US-QS-03 the same Idempotency-Key writes once", async () => {
    await record(lamp(), anna, "same");
    const again = await record(lamp(), anna, "same");
    expect(again).toMatchObject({ ok: true });
    expect(equipment.rows).toHaveLength(1);
  });
});
