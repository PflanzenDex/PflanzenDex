import { beforeEach, describe, expect, it } from "vitest";
import type { Species } from "../../../../catalog";
import { execute } from "../../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import { testSpecies } from "../../../../collection/shared/test-helpers";
import { TargetLocationStub } from "../../../../collection/placement/target-location-stub";
import { swapHandover } from "../../../index";
import { handoverSpecimen, InMemoryHandover } from "./test-helpers";

const S1 = "00000000-0000-4000-8000-0000000000d1";
const GIVER = "anna";
const RECIPIENT = "ben";
// 2026-10-09 23:30 UTC: already 10 October in Berlin (NFR-08).
const NOW = new Date("2026-10-09T23:30:00Z");
const ALOE = testSpecies("sp1", { latinName: "Aloe vera", germanName: "Echte Aloe" });

let store: InMemoryHandover;
let species: Species | null;
let target: TargetLocationStub;
let idem: InMemoryIdempotencyStore;
let n = 0;
const run = (input: unknown = {}, user: string | null = GIVER, key = `k${++n}`) =>
  execute(
    swapHandover({
      swaps: store,
      species: { find: async () => species, findMany: async () => [species] },
      targetLocation: target,
      clock: () => NOW,
    }),
    { idempotency: idem },
    {
      context: { userId: user },
      input: { swapId: S1, timeZone: "Europe/Berlin", ...(input as object) },
      idempotencyKey: key,
    },
  );
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  store = new InMemoryHandover({
    giver: GIVER,
    recipient: RECIPIENT,
    mode: "swap",
    type: "cutting",
  });
  species = ALOE;
  target = new TargetLocationStub(null);
  idem = new InMemoryIdempotencyStore();
});

describe("US-SOZ-11 the location of the new specimen comes from the recipient's care profile", () => {
  it("a received cutting stands at the recipient's growth location, asked for the recipient and not the giver", async () => {
    target = new TargetLocationStub("loc-ben-phase", "loc-ben-growth");
    await run({}, RECIPIENT);
    await run({}, GIVER);
    expect(store.created[0]?.values["locationId"]).toBe("loc-ben-growth");
    expect(target.growthCalls).toEqual([{ userId: RECIPIENT, speciesId: "sp1" }]);
  });

  it("a received plant stands at the location of its phase today", async () => {
    store = new InMemoryHandover({
      giver: GIVER,
      recipient: RECIPIENT,
      mode: "give_away",
      type: "plant",
    });
    target = new TargetLocationStub("loc-ben-phase", "loc-ben-growth");
    await run({}, RECIPIENT);
    await run({}, GIVER);
    expect(store.created[0]?.values["locationId"]).toBe("loc-ben-phase");
    expect(target.calls).toEqual([{ userId: RECIPIENT, speciesId: "sp1", today: "2026-10-10" }]);
  });

  it("without a care profile the location stays unknown and the giver's location is never passed on (P-08)", async () => {
    await run({}, RECIPIENT);
    await run({}, GIVER);
    expect(store.created[0]?.values["locationId"]).toBeNull();
  });

  it("a waiting confirmation asks the port for nothing", async () => {
    target = new TargetLocationStub("x", "y");
    await run({}, GIVER);
    expect([target.calls, target.growthCalls]).toEqual([[], []]);
  });
});

describe("US-SOZ-11 the handover counts only when both sides confirmed", () => {
  it("the first confirmation is recorded and waits for the other side; the collection stays untouched", async () => {
    const r = await run({}, GIVER);
    expect(r.ok && r.value).toEqual({ status: "waiting" });
    expect(store.confirmed).toEqual({ giver: true, recipient: false });
    expect([store.archived, store.created, store.finished]).toEqual([[], [], null]);
  });

  it("the second confirmation completes: archives the giver's specimen and creates the recipient's, in one transaction", async () => {
    await run({}, RECIPIENT);
    const r = await run({}, GIVER);
    expect(r.ok && r.value).toEqual({ status: "handed_over", receivedSpecimenId: "r1" });
    expect(store.archived).toEqual([
      { giver: GIVER, id: "g1", reason: "Getauscht mit Ben", date: "2026-10-10" },
    ]);
    expect(store.created[0]).toMatchObject({
      recipient: RECIPIENT,
      values: {
        speciesId: "sp1",
        name: "Echte Aloe",
        marker: null,
        locationId: null,
        caughtAt: "2026-10-10",
        status: "cutting",
      },
    });
    expect(store.finished).toEqual({ given: "g1", received: "r1" });
  });

  it("a gift is archived as 'Verschenkt an', a plant stays a plant, a cutting or offshoot becomes a cutting (US-BES-04)", async () => {
    store = new InMemoryHandover({
      giver: GIVER,
      recipient: RECIPIENT,
      mode: "give_away",
      type: "plant",
    });
    await run({}, RECIPIENT);
    await run({}, GIVER);
    expect(store.archived[0]?.reason).toBe("Verschenkt an Ben");
    expect(store.created[0]?.values).toMatchObject({ status: "plant" });
  });

  it("the catch date is today's date in the confirming person's time zone, not UTC (NFR-08)", async () => {
    await run({}, RECIPIENT);
    await run({ timeZone: "America/New_York" }, GIVER);
    expect(store.created[0]?.values["caughtAt"]).toBe("2026-10-09");
  });

  it("the recipient needs a marker when a specimen of the species exists already, asked at the recipient's own confirmation", async () => {
    store.recipientHas = [handoverSpecimen({ id: "x1", name: "Echte Aloe", speciesId: "sp1" })];
    const r = await run({}, RECIPIENT);
    expect(errorOf(r)).toBe("specimen.marker_required");
    expect(store.confirmed).toEqual({ giver: false, recipient: false });
    const ok = await run({ marker: "rot" }, RECIPIENT);
    expect(ok.ok).toBe(true);
    await run({}, GIVER);
    expect(store.created[0]?.values).toMatchObject({ name: "Echte Aloe – rot", marker: "rot" });
  });

  it("a refused creation (taken name) leaves everything as it was: swap accepted, nothing archived, the last confirmation not kept", async () => {
    await run({}, RECIPIENT);
    store.refuseReceive = "name_taken";
    const r = await run({}, GIVER);
    expect(errorOf(r)).toBe("specimen.name_taken");
    expect([store.archived, store.created, store.finished]).toEqual([[], [], null]);
    expect(store.confirmed).toEqual({ giver: false, recipient: true });
    expect(store.status).toBe("accepted");
  });

  it("a species the recipient cannot see, or a specimen that is gone, refuses without writing", async () => {
    species = null;
    expect(errorOf(await run({}, RECIPIENT))).toBe("species.not_found");
    species = ALOE;
    store.giverHas = null;
    expect(errorOf(await run({}, RECIPIENT))).toBe("specimen.not_found");
    expect(store.confirmed).toEqual({ giver: false, recipient: false });
  });

  it.each([
    ["not_found", "swap.not_found"],
    ["wrong_state", "swap.wrong_state"],
    ["friendship_ended", "swap.friendship_ended"],
  ] as const)("the outcome %s is the stable error %s", async (outcome, code) => {
    store.outcome = outcome;
    expect(errorOf(await run({}, GIVER))).toBe(code);
  });

  it("a handover that is done answers 'handed_over' again without writing twice", async () => {
    store.outcome = "already_handed_over";
    const r = await run({}, GIVER);
    expect(r.ok && r.value).toEqual({ status: "handed_over", receivedSpecimenId: null });
    expect(store.archived).toEqual([]);
  });

  it("refuses bad input; needs sign-in; the same Idempotency-Key answers once", async () => {
    for (const input of [
      { swapId: "x" },
      { timeZone: "Mars/Base" },
      { marker: "" },
      { marker: "x".repeat(41) },
    ])
      expect(errorOf(await run(input)), JSON.stringify(input)).toBe("input.invalid");
    expect((await run({}, null)).ok).toBe(false);
    const before = store.commits;
    await run({}, GIVER, "same");
    await run({}, GIVER, "same");
    expect(store.commits).toBe(before + 1);
  });
});
