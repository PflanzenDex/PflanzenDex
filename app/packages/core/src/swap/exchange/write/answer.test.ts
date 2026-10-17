import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { swapAnswer } from "../../index";
import { InMemoryExchange } from "../test-helpers";

const S1 = "00000000-0000-4000-8000-0000000000e1";

function setup() {
  const swaps = new InMemoryExchange({});
  const idem = new InMemoryIdempotencyStore();
  let n = 0;
  const run = (input: unknown, user: string | null = "anna", key = `k${++n}`) =>
    execute(
      swapAnswer({ swaps }),
      { idempotency: idem },
      {
        context: { userId: user },
        input,
        idempotencyKey: key,
      },
    );
  return { swaps, run };
}

describe("US-SOZ-10 answering a swap request", () => {
  it.each(["accept", "decline", "cancel", "withdraw"] as const)(
    "passes the action %s to the store for the caller only",
    async (action) => {
      const { swaps, run } = setup();
      const r = await run({ swapId: S1, action });
      expect(r.ok && r.value).toEqual({ status: "accepted" });
      expect(swaps.answers).toEqual([
        { userId: "anna", swapId: S1, action, reason: null, proposal: null },
      ]);
    },
  );

  it("a decline or a cancelation carries the optional reason, trimmed", async () => {
    const { swaps, run } = setup();
    await run({ swapId: S1, action: "decline", reason: "  Zu klein  " });
    await run({ swapId: S1, action: "cancel", reason: "Doch behalten" });
    expect(swaps.answers.map((a) => a.reason)).toEqual(["Zu klein", "Doch behalten"]);
  });

  it("proposing something else needs the text; other actions ignore a proposal", async () => {
    const { swaps, run } = setup();
    const missing = await run({ swapId: S1, action: "propose" });
    expect(!missing.ok && missing.error.details).toEqual([
      { field: "proposal", code: "input.invalid" },
    ]);
    expect((await run({ swapId: S1, action: "propose", proposal: "Lieber eine Aloe" })).ok).toBe(
      true,
    );
    await run({ swapId: S1, action: "accept", proposal: "ignoriert" });
    expect(swaps.answers.map((a) => a.proposal)).toEqual(["Lieber eine Aloe", null]);
  });

  it("refuses bad input before asking the store: unknown action, bad id, empty or too long text", async () => {
    const { swaps, run } = setup();
    for (const input of [
      {},
      { swapId: "x", action: "accept" },
      { swapId: S1, action: "explode" },
      { swapId: S1, action: "decline", reason: "" },
      { swapId: S1, action: "decline", reason: "x".repeat(201) },
      { swapId: S1, action: "propose", proposal: "x".repeat(501) },
    ]) {
      const r = await run(input);
      expect(!r.ok && r.error.code, JSON.stringify(input)).toBe("input.invalid");
    }
    expect(swaps.answers).toEqual([]);
  });

  it.each([
    ["not_found", "swap.not_found"],
    ["not_allowed", "swap.not_allowed"],
    ["wrong_state", "swap.wrong_state"],
    ["offer_not_open", "offer.not_active"],
    ["friendship_ended", "swap.friendship_ended"],
  ] as const)("the outcome %s is the stable error %s", async (outcome, code) => {
    const { swaps, run } = setup();
    swaps.answerOutcome = outcome;
    const r = await run({ swapId: S1, action: "accept" });
    expect(!r.ok && r.error.code).toBe(code);
  });

  it("needs sign-in; the same Idempotency-Key answers once", async () => {
    const { swaps, run } = setup();
    expect((await run({ swapId: S1, action: "accept" }, null)).ok).toBe(false);
    await run({ swapId: S1, action: "accept" }, "anna", "same");
    await run({ swapId: S1, action: "accept" }, "anna", "same");
    expect(swaps.answers).toHaveLength(1);
  });
});
