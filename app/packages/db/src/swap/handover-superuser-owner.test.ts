import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  befriend,
  createAccountWithName,
  createFixtureSpecimen,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "../fixtures.ts";
import { withAccount } from "../kernel/index.ts";
import { SharingPostgres } from "../social/index.ts";
import { OffersPostgres, SwapsPostgres } from "./index.ts";

// #907, US-SOZ-10, US-SOZ-11, P-04, QG-D1: `finish_handover()`, `set_swap_state()` and `reopen_offer()` with a SUPERUSER
// as owner of the tables (a scratch database, see createSuperuserOwnerDatabase). Before migration 0092 an update by
// `swap_id` hit both rows of a swap each time: `finish_handover()` wrote the received specimen into the giver's row
// and the given one into the recipient's row.
let db: SuperuserOwnerDatabase;
let pool: Pool;
let swaps: SwapsPostgres;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("handover");
  pool = db.pool;
  swaps = new SwapsPostgres(pool);
  for (const id of [anna, ben, cleo]) await createAccountWithName(pool, id, `S-${id.slice(0, 4)}`);
  await befriend(pool, anna, ben);
  await befriend(pool, anna, cleo);
});
afterAll(async () => {
  await db.drop();
});

/** An open offer of Anna (shared with friends) and a request by `by`. */
async function requested(by: string) {
  const specimen = await createFixtureSpecimen(
    pool,
    anna,
    `Ableger ${randomUUID().slice(0, 6)}`,
    pool,
  );
  await new SharingPostgres(pool).set(anna, specimen, true, false);
  const offer = (await new OffersPostgres(pool).create(anna, {
    specimenId: specimen,
    type: "cutting",
    mode: "swap",
    wish: null,
    note: null,
  })) as { id: string };
  const r = await swaps.request(by, offer.id, null, null);
  return { specimen, offerId: offer.id, swapId: r.swapId as string };
}
const offerStatus = async (offerId: string) =>
  (
    await withAccount(pool, anna, (c) =>
      c.query("select status from offer where id = $1", [offerId]),
    )
  ).rows[0]?.status;
const row = async (user: string, swapId: string) =>
  (await swaps.list(user)).find((s) => s.swapId === swapId);
const accept = (swapId: string) =>
  swaps.answer(anna, swapId, { action: "accept", reason: null, proposal: null });

describe("US-SOZ-11 finish_handover() with a superuser as table owner (#907)", () => {
  it("US-SOZ-11 each side's row records only its own specimen: the giver the given one, the recipient the received one", async () => {
    const a = await requested(ben);
    await accept(a.swapId);
    for (const user of [ben, anna])
      await swaps.handover(user, async (s) => {
        await s.confirm(a.swapId, null);
        return { commit: true, value: null };
      });
    const received = await createFixtureSpecimen(pool, ben, "Erhalten", pool);
    expect(
      await swaps.handover(anna, async (s) => ({
        commit: true,
        value: await s.finish(a.swapId, a.specimen, received),
      })),
    ).toBe(true);
    expect(await row(anna, a.swapId)).toMatchObject({
      status: "handed_over",
      givenSpecimenId: a.specimen,
      receivedSpecimenId: null,
    });
    expect(await row(ben, a.swapId)).toMatchObject({
      status: "handed_over",
      givenSpecimenId: null,
      receivedSpecimenId: received,
    });
    expect(await offerStatus(a.offerId)).toBe("handed_over");
  });
});

describe("US-SOZ-10 set_swap_state() and reopen_offer() with a superuser as table owner (#907)", () => {
  it("US-SOZ-10 declining a request moves both rows of that swap, and no other swap of the same offer owner", async () => {
    const a = await requested(ben);
    const b = await requested(cleo);
    expect(
      (await swaps.answer(anna, a.swapId, { action: "decline", reason: "nein", proposal: null }))
        .outcome,
    ).toBe("ok");
    expect(await row(anna, a.swapId)).toMatchObject({ status: "declined", reason: "nein" });
    expect(await row(ben, a.swapId)).toMatchObject({ status: "declined", reason: "nein" });
    expect(await row(anna, b.swapId)).toMatchObject({ status: "requested", reason: null });
    expect(await row(cleo, b.swapId)).toMatchObject({ status: "requested", reason: null });
  });

  it("US-SOZ-10 cancelling an accepted swap gives the offer back to the giver", async () => {
    const a = await requested(ben);
    await accept(a.swapId);
    expect(await offerStatus(a.offerId)).toBe("reserved");
    await swaps.answer(anna, a.swapId, { action: "cancel", reason: null, proposal: null });
    expect(await offerStatus(a.offerId)).toBe("open");
  });

  it("US-SOZ-10 P-04 the internal helpers touch only the account they are told to, even for an owner that bypasses row security", async () => {
    const a = await requested(ben);
    await accept(a.swapId);
    // reopen_offer for the WRONG giver must not reopen Anna's reserved offer (the owner role may call it directly).
    await pool.query("select reopen_offer($1, $2)", [cleo, a.offerId]);
    expect(await offerStatus(a.offerId)).toBe("reserved");
    // set_swap_state without a current account and for a third account leaves both rows of the swap alone.
    await pool.query("select set_swap_state($1, $2, 'canceled', null, null, null)", [
      a.swapId,
      cleo,
    ]);
    expect(await row(anna, a.swapId)).toMatchObject({ status: "accepted" });
    expect(await row(ben, a.swapId)).toMatchObject({ status: "accepted" });
  });
});
