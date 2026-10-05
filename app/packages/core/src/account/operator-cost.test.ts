import { beforeEach, describe, expect, it } from "vitest";
import { ERROR_TEXTS, execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { costPerUser, operatorCostSet, operatorOverview } from "./index";
import { InMemoryAccess } from "./test-helpers";

const NOW = new Date("2026-10-04T10:00:00.000Z");
const FIGURE = { amountCents: 4999, currency: "EUR", month: "2026-09" };
let access: InMemoryAccess;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const setCost = (input: unknown, userId: string | null = "olga", key = `k${++counter}`) =>
  execute(
    operatorCostSet({ access, now: () => NOW }),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: key },
  );

beforeEach(() => {
  access = new InMemoryAccess({ olga: ["operator"], rita: ["reviewer"], kai: [] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-ACC-05 · cost per user from a manual monthly figure", () => {
  it("US-ACC-05 divides the amount by the active accounts, rounded half up to whole cents", () => {
    expect(costPerUser(FIGURE, 5)).toEqual({
      known: true,
      amountCents: 1000,
      currency: "EUR",
      month: "2026-09",
      source: "manual",
    });
    expect(costPerUser({ ...FIGURE, amountCents: 1000 }, 3)).toMatchObject({ amountCents: 333 });
    expect(costPerUser({ ...FIGURE, amountCents: 1001 }, 2)).toMatchObject({ amountCents: 501 });
    expect(costPerUser({ ...FIGURE, amountCents: 0 }, 4)).toMatchObject({ amountCents: 0 });
  });

  it("US-ACC-05 without a figure or without active accounts the cost per user is unknown with the reason (P-08)", () => {
    expect(costPerUser(null, 5)).toEqual({ known: false, reason: "no_figure" });
    expect(costPerUser(FIGURE, 0)).toEqual({ known: false, reason: "no_active_accounts" });
  });

  it("US-ACC-05 the overview carries the entered figure and the cost per user derived from it", async () => {
    access.active = 4;
    access.cost = { amountCents: 2000, currency: "CHF", month: "2026-10" };
    const r = await operatorOverview({ access }, "olga");
    expect(r.ok && r.value).toMatchObject({
      cost: { amountCents: 2000, currency: "CHF", month: "2026-10" },
      costPerUser: { known: true, amountCents: 500, currency: "CHF", source: "manual" },
    });
  });
});

describe("US-ACC-05 · only the operator enters the monthly cost", () => {
  it("US-ACC-05 the operator enters a figure; a new entry replaces the old one", async () => {
    expect((await setCost(FIGURE)).ok).toBe(true);
    const r = await setCost({ amountCents: 6000, currency: "EUR", month: "2026-10" });
    expect(r.ok && r.value).toEqual({ amountCents: 6000, currency: "EUR", month: "2026-10" });
    expect(access.cost).toEqual({ amountCents: 6000, currency: "EUR", month: "2026-10" });
    expect(access.costSetBy).toEqual(["olga", "olga"]);
  });

  it.each([["kai"], ["rita"]])(
    "US-ACC-05 %s gets access.denied and nothing is stored",
    async (who) => {
      const r = await setCost(FIGURE, who);
      expect(!r.ok && r.error.code).toBe("access.denied");
      expect(access.cost).toBeNull();
    },
  );

  it("US-ACC-05 a month after the current month (UTC) is refused with operator_cost.month_in_future", async () => {
    const r = await setCost({ ...FIGURE, month: "2026-11" });
    expect(!r.ok && r.error.code).toBe("operator_cost.month_in_future");
    expect(!r.ok && r.error.details).toEqual([{ field: "month", code: "input.invalid" }]);
    expect(ERROR_TEXTS["operator_cost.month_in_future"]).toMatch(/Zukunft/);
    expect(access.cost).toBeNull();
  });

  it.each([
    ["a negative amount", { amountCents: -1 }, "amountCents"],
    ["more than 1,000,000.00", { amountCents: 100_000_001 }, "amountCents"],
    ["a fraction of a cent", { amountCents: 12.5 }, "amountCents"],
    ["a lower-case currency", { currency: "eur" }, "currency"],
    ["a currency of four letters", { currency: "EURO" }, "currency"],
    ["a month without year", { month: "10" }, "month"],
    ["month 13", { month: "2026-13" }, "month"],
  ])("US-ACC-05 refuses %s with input.invalid on the field", async (_, change, field) => {
    const r = await setCost({ ...FIGURE, ...change });
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details).toEqual([{ field, code: "input.invalid" }]);
    expect(access.cost).toBeNull();
  });
});
