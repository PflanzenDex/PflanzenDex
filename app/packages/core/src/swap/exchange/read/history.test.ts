import { describe, expect, it } from "vitest";
import { swapHistory, swapProvenance } from "../../index";
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
  status: "handed_over",
  requestedAt: "2026-10-01T10:00:00.000Z",
  reason: null,
  cause: null,
  proposal: false,
  decidedAt: "2026-10-05T10:00:00.000Z",
  confirmedGiver: true,
  confirmedRecipient: true,
  givenSpecimenId: "g1",
  receivedSpecimenId: null,
  handedOverAt: "2026-10-10T10:00:00.000Z",
  ...extra,
});

describe("US-SOZ-13 the swap history", () => {
  it("lists completed and ended swaps with date, friend, given or received, species and status; open ones are not history", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["anna"] = [
      side({ swapId: "open", status: "requested", handedOverAt: null, decidedAt: null }),
      side({ swapId: "done" }),
      side({
        swapId: "got",
        role: "recipient",
        otherName: "Cleo",
        receivedSpecimenId: "r1",
        givenSpecimenId: null,
      }),
      side({
        swapId: "no",
        status: "declined",
        reason: "Zu klein",
        handedOverAt: null,
        decidedAt: "2026-10-06T10:00:00.000Z",
      }),
      side({
        swapId: "cx",
        status: "canceled",
        cause: "friendship_ended",
        handedOverAt: null,
        decidedAt: "2026-10-07T10:00:00.000Z",
      }),
      side({
        swapId: "wd",
        status: "withdrawn",
        handedOverAt: null,
        decidedAt: "2026-10-08T10:00:00.000Z",
      }),
    ];
    const { entries } = await swapHistory({ swaps }, "anna");
    expect(entries.map((e) => e.swapId)).toEqual(["done", "got", "wd", "cx", "no"]);
    expect(entries.find((e) => e.swapId === "done")).toMatchObject({
      direction: "given",
      friend: "Ben",
      species: "Echte Aloe",
      status: "handed_over",
      date: "2026-10-10T10:00:00.000Z",
    });
    expect(entries.find((e) => e.swapId === "got")).toMatchObject({
      direction: "received",
      friend: "Cleo",
    });
    expect(entries.find((e) => e.swapId === "no")).toMatchObject({
      status: "declined",
      reason: "Zu klein",
      date: "2026-10-06T10:00:00.000Z",
    });
    expect(entries.find((e) => e.swapId === "cx")?.cause).toBe("friendship_ended");
  });

  it("the date is the handover, else the last decision, else the request; a friend without a name stays unknown (P-08)", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["anna"] = [
      side({
        swapId: "a",
        status: "declined",
        handedOverAt: null,
        decidedAt: null,
        otherName: null,
      }),
    ];
    const { entries } = await swapHistory({ swaps }, "anna");
    expect(entries[0]).toMatchObject({ date: "2026-10-01T10:00:00.000Z", friend: null });
  });

  it("the history stays after the friendship ended: the stored name is used, nothing is looked up again", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["anna"] = [side({ otherName: "Ben (damals)" })];
    expect((await swapHistory({ swaps }, "anna")).entries[0]?.friend).toBe("Ben (damals)");
  });

  it("cancels what lost its friendship first and shows only my own swaps (P-04)", async () => {
    const swaps = new InMemoryExchange({});
    swaps.sides["ben"] = [side()];
    expect((await swapHistory({ swaps }, "anna")).entries).toEqual([]);
    expect(swaps.orphaned).toBe(1);
  });
});

describe("US-SOZ-13 provenance of a received specimen (the port of the cards)", () => {
  it("answers from whom and when for received specimens only, and asks the store for the caller", async () => {
    const swaps = new InMemoryExchange({});
    swaps.provenance["anna"] = { r1: { from: "Ben", date: "2026-10-10T10:00:00.000Z" } };
    const source = swapProvenance({ swaps });
    const r = await source.forSpecimens("anna", ["r1", "own"]);
    expect([...r.entries()]).toEqual([["r1", { from: "Ben", date: "2026-10-10T10:00:00.000Z" }]]);
    expect((await source.forSpecimens("ben", ["r1"])).size).toBe(0);
  });
});
