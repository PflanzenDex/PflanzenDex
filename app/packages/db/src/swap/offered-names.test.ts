import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName, createFixtureSpecimen } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { SpecimenPostgres } from "../collection/index.ts";
import { FriendsPostgres, SharingPostgres } from "../social/index.ts";
import { OffersPostgres, SwapsPostgres } from "./index.ts";

// US-SOZ-11, Q-149, P-04, P-05: the offered specimen of a giver's plant (offeredNames) on real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup only (#294)
let swaps: SwapsPostgres;
let offers: OffersPostgres;
let sharing: SharingPostgres;
let friends: FriendsPostgres;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];
const uid = () => randomUUID().slice(0, 8);
let seed = 0;
const newCode = () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let n = Date.now() * 1000 + ++seed;
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += alphabet[n % 32];
    n = Math.floor(n / 32) + i * 7 + seed;
  }
  return out;
};
async function befriend(a: string, b: string) {
  const code = newCode();
  await friends.createCode(a, { code, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await friends.requestWithCode(b, code);
  const id = (await friends.openRequests(a))[0]?.id as string;
  await friends.answer(a, id, true);
}

/** A shared offer of `owner` for one specimen of the given type, with its name (the precondition of an offer, US-SOZ-08). */
async function offer(owner: string, type: "cutting" | "plant") {
  const name = `Offer ${type} ${uid()}`;
  const specimenId = await createFixtureSpecimen(pool, owner, name);
  await sharing.set(owner, specimenId, true, false);
  const o = (await offers.create(owner, {
    specimenId,
    type,
    mode: "swap",
    wish: null,
    note: null,
  })) as { id: string };
  return { specimenId, offerId: o.id, name };
}

/** Anna offers a plant; Ben requests it and Anna accepts. */
async function acceptedPlant() {
  const o = await offer(anna, "plant");
  const r = await swaps.request(ben, o.offerId, null, null);
  const swapId = r.swapId as string;
  await swaps.answer(anna, swapId, { action: "accept", reason: null, proposal: null });
  return { ...o, swapId };
}

/** The handover of an accepted swap in one transaction, as core runs it: the giver confirms, then the recipient completes. */
async function handOver(a: { swapId: string; specimenId: string }) {
  await swaps.handover(anna, async (s) => ({
    commit: true,
    value: await s.confirm(a.swapId, null),
  }));
  return swaps.handover(ben, async (s) => {
    await s.confirm(a.swapId, null);
    const given = await s.giverSpecimen(anna, a.specimenId);
    // A plant leaves the giver's collection (Q-149); the recipient gets a new specimen of the same species.
    await s.archiveGiven(anna, a.specimenId, "Getauscht mit Ben", "2026-10-10");
    const made = await s.createReceived(
      ben,
      {
        speciesId: (given as { speciesId: string }).speciesId,
        name: `Erhalten ${uid()}`,
        marker: null,
        locationId: null,
        caughtAt: "2026-10-10",
        status: "cutting",
      },
      [],
    );
    await s.finish(a.swapId, a.specimenId, made.id);
    return { commit: true, value: made.id };
  });
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  swaps = new SwapsPostgres(pool);
  offers = new OffersPostgres(pool);
  sharing = new SharingPostgres(pool);
  friends = new FriendsPostgres(pool);
  for (const id of [anna, ben, cleo]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
  await befriend(anna, ben);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben, cleo]]);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-11 the offered specimen of a giver's plant (offeredNames, P-05)", () => {
  it("US-SOZ-11 an accepted plant of the giver names its specimen, not archived: the card names it before the confirmation", async () => {
    const a = await acceptedPlant();
    expect((await swaps.offeredNames(anna)).get(a.swapId)).toEqual({
      name: a.name,
      archived: false,
    });
  });

  it("US-SOZ-11 a handed-over plant that is archived names it as archived: the card's archive line", async () => {
    const a = await acceptedPlant();
    await handOver(a);
    expect((await swaps.offeredNames(anna)).get(a.swapId)).toEqual({
      name: a.name,
      archived: true,
    });
  });

  it("US-SOZ-11 US-BES-07 a plant restored after the handover names it as not archived", async () => {
    const a = await acceptedPlant();
    await handOver(a);
    expect(await new SpecimenPostgres(pool).restore(anna, a.specimenId)).toMatchObject({
      id: a.specimenId,
      status: "plant",
    });
    expect((await swaps.offeredNames(anna)).get(a.swapId)).toEqual({
      name: a.name,
      archived: false,
    });
  });

  it("US-SOZ-11 a cutting, a requested plant and a declined plant name nothing; the recipient's own rows name nothing", async () => {
    const cutting = await offer(anna, "cutting");
    const cuttingSwap = (await swaps.request(ben, cutting.offerId, null, null)).swapId as string;
    await swaps.answer(anna, cuttingSwap, { action: "accept", reason: null, proposal: null });
    const requested = await offer(anna, "plant");
    const requestedSwap = (await swaps.request(ben, requested.offerId, null, null))
      .swapId as string;
    const declined = await offer(anna, "plant");
    const declinedSwap = (await swaps.request(ben, declined.offerId, null, null)).swapId as string;
    await swaps.answer(anna, declinedSwap, { action: "decline", reason: null, proposal: null });
    const named = await swaps.offeredNames(anna);
    expect([cuttingSwap, requestedSwap, declinedSwap].map((id) => named.has(id))).toEqual([
      false,
      false,
      false,
    ]);
    expect((await swaps.offeredNames(ben)).size).toBe(0);
  });

  it("US-SOZ-11 tenant isolation: a stranger and the other side read none of the giver's names (P-04, P-05)", async () => {
    const a = await acceptedPlant();
    expect((await swaps.offeredNames(cleo)).has(a.swapId)).toBe(false);
    expect((await swaps.offeredNames(ben)).has(a.swapId)).toBe(false);
    expect((await swaps.offeredNames(anna)).has(a.swapId)).toBe(true);
  });
});
