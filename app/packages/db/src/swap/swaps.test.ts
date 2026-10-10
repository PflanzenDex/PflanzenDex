import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName, createFixtureSpecimen } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { FriendsPostgres, SharingPostgres } from "../social/index.ts";
import { OffersPostgres, SwapsPostgres } from "./index.ts";

// US-SOZ-09, DM-SOZ-03, ADR 0012, P-04, P-05: offers of friends and requests (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant observation and cleanup (#294)
let swaps: SwapsPostgres;
let offers: OffersPostgres;
let sharing: SharingPostgres;
let friends: FriendsPostgres;
const [anna, ben, cleo, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
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
  return (await friends.friends(a)).find((f) => f.accountId === b)?.id as string;
}
const specimen = (owner: string, name: string) => createFixtureSpecimen(pool, owner, name);
/** An open offer of `owner`, shared with friends (the precondition of an offer, US-SOZ-08). */
async function offer(
  owner: string,
  name: string,
  mode: "swap" | "give_away" = "swap",
  share = true,
) {
  const s = await specimen(owner, name);
  if (share) await sharing.set(owner, s, true, false);
  const o = (await offers.create(owner, {
    specimenId: s,
    type: "cutting",
    mode,
    wish: null,
    note: null,
  })) as { id: string };
  return { specimenId: s, offerId: o.id };
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  swaps = new SwapsPostgres(pool);
  offers = new OffersPostgres(pool);
  sharing = new SharingPostgres(pool);
  friends = new FriendsPostgres(pool);
  for (const id of [anna, ben, cleo, dora])
    await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
  await befriend(anna, ben);
  await befriend(anna, cleo);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben, cleo, dora]]);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-09 the open offers of friends", () => {
  it("a friend sees the open, shared offers of the other side with the name it stored, newest first, never the own ones", async () => {
    const first = await offer(anna, "Freundesangebot 1");
    const second = await offer(anna, "Freundesangebot 2", "give_away");
    const seen = await swaps.friendOffers(ben);
    expect(seen.map((o) => o.offerId)).toEqual(
      expect.arrayContaining([first.offerId, second.offerId]),
    );
    expect(seen.find((o) => o.offerId === second.offerId)).toMatchObject({
      ownerId: anna,
      ownerName: `N-${anna.slice(0, 4)}`,
      specimenId: second.specimenId,
      mode: "give_away",
      photosShared: false,
    });
    expect(seen.filter((o) => o.ownerId === ben)).toEqual([]);
    expect((await swaps.friendOffers(anna)).map((o) => o.offerId)).not.toContain(first.offerId);
  });

  it("a stranger sees nothing, and nothing is read through the table (P-05)", async () => {
    const o = await offer(anna, "Nur Freunden");
    expect((await swaps.friendOffers(dora)).map((x) => x.offerId)).not.toContain(o.offerId);
    const direct = await withAccount(pool, ben, (c) =>
      c.query("select id from offer where id = $1", [o.offerId]),
    );
    expect(direct.rows).toEqual([]);
  });

  it("an offer whose specimen is not shared and a withdrawn one stay hidden", async () => {
    const unshared = await offer(anna, "Nicht geteilt", "swap", false);
    const gone = await offer(anna, "Zurückgezogen");
    await offers.withdraw(anna, gone.offerId);
    const ids = (await swaps.friendOffers(ben)).map((o) => o.offerId);
    expect(ids).not.toContain(unshared.offerId);
    expect(ids).not.toContain(gone.offerId);
  });

  it("the account is restored after reading, so the caller keeps its own context", async () => {
    await withAccount(pool, ben, async (c) => {
      await c.query("select * from friend_offers()");
      const me = await c.query("select current_setting('app.account_id') as id");
      expect(me.rows[0].id).toBe(ben);
    });
  });
});

describe("US-SOZ-09 requesting an offer", () => {
  it("creates both sides in one transaction: each sees exactly its own row, with the data that outlives the offer", async () => {
    const o = await offer(anna, "Anfrage 1");
    const r = await swaps.request(ben, o.offerId, null, "Gern gegen einen Ableger");
    expect(r.outcome).toBe("requested");
    const mine = (await swaps.list(ben)).find((s) => s.swapId === r.swapId);
    const theirs = (await swaps.list(anna)).find((s) => s.swapId === r.swapId);
    expect(mine).toMatchObject({
      role: "recipient",
      otherId: anna,
      otherName: `N-${anna.slice(0, 4)}`,
      offerId: o.offerId,
      status: "requested",
      counterText: "Gern gegen einen Ableger",
      type: "cutting",
      mode: "swap",
    });
    expect(theirs).toMatchObject({
      role: "giver",
      otherId: ben,
      otherName: `N-${ben.slice(0, 4)}`,
      offerId: o.offerId,
      status: "requested",
    });
    expect((await swaps.list(cleo)).find((s) => s.swapId === r.swapId)).toBeUndefined();
    const count = await admin.query("select count(*)::int as n from swap where swap_id = $1", [
      r.swapId,
    ]);
    expect(count.rows[0].n).toBe(2);
  });

  it("only one open request per offer from the same account; another friend may request it too", async () => {
    const o = await offer(anna, "Anfrage 2");
    expect((await swaps.request(ben, o.offerId, null, null)).outcome).toBe("requested");
    expect((await swaps.request(ben, o.offerId, null, null)).outcome).toBe("already_requested");
    expect((await swaps.request(cleo, o.offerId, null, null)).outcome).toBe("requested");
  });

  it("the own offer cannot be requested", async () => {
    const o = await offer(anna, "Eigenes Angebot");
    expect(await swaps.request(anna, o.offerId, null, null)).toEqual({
      outcome: "own_offer",
      swapId: null,
    });
  });

  it("a stranger, an unknown id, an unshared specimen and a withdrawn offer all look like 'unknown' and write nothing", async () => {
    const shared = await offer(anna, "Anfrage 3");
    const unshared = await offer(anna, "Anfrage 4", "swap", false);
    const withdrawn = await offer(anna, "Anfrage 5");
    await offers.withdraw(anna, withdrawn.offerId);
    const before = await admin.query("select count(*)::int as n from swap");
    expect((await swaps.request(dora, shared.offerId, null, null)).outcome).toBe("offer_unknown");
    expect((await swaps.request(ben, randomUUID(), null, null)).outcome).toBe("offer_unknown");
    expect((await swaps.request(ben, unshared.offerId, null, null)).outcome).toBe("offer_unknown");
    expect((await swaps.request(ben, withdrawn.offerId, null, null)).outcome).toBe("not_open");
    const after = await admin.query("select count(*)::int as n from swap");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("a counter-offer must be an own, active, shared specimen and only for the mode swap", async () => {
    const swapOffer = await offer(anna, "Anfrage 6");
    const gift = await offer(anna, "Anfrage 7", "give_away");
    const mineShared = await specimen(ben, "Mein Gegenangebot");
    await sharing.set(ben, mineShared, true, false);
    const mineSecret = await specimen(ben, "Privat");
    const annasOwn = await specimen(anna, "Annas");
    expect((await swaps.request(ben, swapOffer.offerId, mineSecret, null)).outcome).toBe(
      "counter_not_shared",
    );
    expect((await swaps.request(ben, swapOffer.offerId, annasOwn, null)).outcome).toBe(
      "counter_unknown",
    );
    expect((await swaps.request(ben, gift.offerId, mineShared, null)).outcome).toBe(
      "counter_not_allowed",
    );
    expect((await swaps.request(ben, gift.offerId, null, "Tausch?")).outcome).toBe(
      "counter_not_allowed",
    );
    const ok = await swaps.request(ben, swapOffer.offerId, mineShared, null);
    expect(ok.outcome).toBe("requested");
    expect((await swaps.list(ben)).find((s) => s.swapId === ok.swapId)).toMatchObject({
      counterName: "Mein Gegenangebot",
    });
    expect((await swaps.list(anna)).find((s) => s.swapId === ok.swapId)).toMatchObject({
      counterName: "Mein Gegenangebot",
    });
  });

  it("after the friendship ended nothing is offered or requestable any more", async () => {
    const o = await offer(anna, "Anfrage 8");
    const link = await befriend(anna, dora);
    expect((await swaps.friendOffers(dora)).map((x) => x.offerId)).toContain(o.offerId);
    await friends.end(anna, link);
    expect((await swaps.friendOffers(dora)).map((x) => x.offerId)).not.toContain(o.offerId);
    expect((await swaps.request(dora, o.offerId, null, null)).outcome).toBe("offer_unknown");
  });
});
