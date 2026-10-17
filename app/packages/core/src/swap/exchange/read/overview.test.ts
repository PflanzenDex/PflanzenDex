import { describe, expect, it } from "vitest";
import { swapOverview } from "../../index";
import { InMemoryExchange } from "../test-helpers";
import type { SwapSide } from "../types";

const side = (extra: Partial<SwapSide> = {}): SwapSide => ({
  swapId: "s1",
  role: "giver",
  otherId: "ben",
  otherName: "Ben",
  offerId: "o1",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  type: "cutting",
  mode: "swap",
  counterName: null,
  counterText: null,
  status: "requested",
  requestedAt: "2026-10-09T10:00:00.000Z",
  reason: null,
  cause: null,
  proposal: false,
  decidedAt: null,
  confirmedGiver: false,
  confirmedRecipient: false,
  givenSpecimenId: null,
  receivedSpecimenId: null,
  handedOverAt: null,
  ...extra,
});

describe("US-SOZ-10 both sides see the state", () => {
  it("splits my swaps into requests I received (giver) and requests I sent (recipient), newest first", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["anna"] = [
      side({ swapId: "a", role: "giver" }),
      side({ swapId: "b", role: "recipient", status: "accepted" }),
      side({ swapId: "c", role: "giver", status: "declined", cause: "already_given" }),
    ];
    const r = await swapOverview({ swaps }, "anna");
    expect(r.received.map((s) => s.swapId)).toEqual(["a", "c"]);
    expect(r.sent.map((s) => s.swapId)).toEqual(["b"]);
  });

  it("checks the friendships first, so a swap behind an ended friendship shows as canceled (lazy check)", async () => {
    const swaps = new InMemoryExchange({});
    await swapOverview({ swaps }, "anna");
    expect(swaps.orphaned).toBe(1);
  });

  it("another account's swaps are not part of the answer (P-04)", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["ben"] = [side()];
    const r = await swapOverview({ swaps }, "anna");
    expect([r.received, r.sent]).toEqual([[], []]);
  });
});
