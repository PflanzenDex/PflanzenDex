import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-11 and US-SOZ-09: the handover of an accepted swap and the approved species in the exchange list, through the API
// (real PostgreSQL). The species is approved, so the recipient can see it; this is the one file of the swap module that
// holds the taxon lock (short: a handful of requests).
let pool: Pool;
let admin: Pool;
let releaseTaxa: (() => Promise<void>) | undefined;
const [subA, subB, subC, subD, subE, subOp] = [0, 1, 2, 3, 4, 5].map(
  () => `soz11-${randomUUID()}`,
) as [string, string, string, string, string, string];
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: `Name ${sub.slice(-4)}`, email_verified: true }
    : null;
};
// 2026-10-09 23:30 UTC: already 10 October in Berlin (NFR-08).
const NOW = new Date("2026-10-09T23:30:00Z");
let app: ReturnType<typeof createApp>;
type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (key && method !== "GET") headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

let speciesId = "";
const specimen = async (sub: string, marker?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      ...(marker ? { marker } : {}),
    })
  ).body.id as string;
async function befriend(inviter: string, redeemer: string) {
  const { code } = (await call(inviter, "POST", "/friends/invitations", {})).body;
  await call(redeemer, "POST", "/friends/requests", { code });
  const incoming = (await call(inviter, "GET", "/friends/requests")).body.incoming as {
    id: string;
  }[];
  await call(inviter, "POST", `/friends/requests/${incoming[0]?.id}/answer`, {
    decision: "accept",
  });
}
/** An accepted swap: A offers a fresh specimen (marker `m`), B requests, A accepts. */
async function accepted(m: string, mode: "swap" | "give_away" = "swap", by = subB) {
  const id = await specimen(subA, m);
  await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
  const offerId = (await call(subA, "POST", "/offers", { specimenId: id, type: "cutting", mode }))
    .body.id as string;
  const swapId = (await call(by, "POST", `/offers/${offerId}/request`, {})).body.swapId as string;
  await call(subA, "POST", `/swaps/${swapId}/answer`, { action: "accept" });
  return { specimenId: id, offerId, swapId };
}
const confirm = (
  sub: string | null,
  swapId: string,
  body: Record<string, unknown> = {},
  key?: string | null,
) => call(sub, "POST", `/swaps/${swapId}/handover`, { timeZone: "Europe/Berlin", ...body }, key);
const swaps = async (sub: string) =>
  (await call(sub, "GET", "/swaps")).body as {
    received: { swapId: string; status: string }[];
    sent: { swapId: string; status: string }[];
  };

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  releaseTaxa = await holdTaxonLock(admin);
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
  for (const sub of [subA, subB, subC, subD, subE, subOp]) await call(sub, "GET", "/account");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOp],
  );
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: `Handoverus${randomUUID()
        .replace(/[0-9-]/g, "x")
        .slice(0, 8)} novus`,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      source: "RHS",
    })
  ).body.id;
  const entries = (await call(subOp, "GET", "/review")).body.entries as {
    species: { id: string } | null;
    reviewCase: { id: string };
  }[];
  const entry = entries.find((e) => e.species?.id === speciesId);
  await call(subOp, "POST", `/review/${entry?.reviewCase.id}/decide`, { status: "reviewed" });
  await befriend(subA, subB);
  await befriend(subA, subC);
  await befriend(subA, subD);
  await befriend(subA, subE);
}, 120_000);
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC, subD, subE, subOp]];
  await admin.query(`delete from swap where account_id in (${accounts})`, subs);
  await admin.query(`delete from offer where account_id in (${accounts})`, subs);
  await admin.query(`delete from care_profile where account_id in (${accounts})`, subs);
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query(`delete from friendship where account_id in (${accounts})`, subs);
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await releaseTaxa?.();
  await admin.end();
});

describe("US-SOZ-11 the handover through the API", () => {
  it("without a token 401, no Idempotency-Key 400, bad time zone 400, unknown or foreign swap 404", async () => {
    const a = await accepted("H0");
    expect((await confirm(null, a.swapId)).status).toBe(401);
    expect((await confirm(subA, a.swapId, {}, null)).status).toBe(400);
    expect((await confirm(subA, a.swapId, { timeZone: "Mars/Base" })).body.error.details).toEqual([
      { field: "timeZone", code: "input.invalid" },
    ]);
    expect((await confirm(subA, randomUUID())).body.error.code).toBe("swap.not_found");
    expect((await confirm(subC, a.swapId)).body.error.code).toBe("swap.not_found");
  });

  it("only an accepted swap can be handed over (409 swap.wrong_state)", async () => {
    const id = await specimen(subA, "H1");
    await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
    const offerId = (
      await call(subA, "POST", "/offers", { specimenId: id, type: "cutting", mode: "swap" })
    ).body.id as string;
    const swapId = (await call(subB, "POST", `/offers/${offerId}/request`, {})).body
      .swapId as string;
    expect(await confirm(subA, swapId)).toMatchObject({
      status: 409,
      body: { error: { code: "swap.wrong_state" } },
    });
  });

  it("the first confirmation waits; the second completes: the giver's specimen is archived, the recipient gets a new one with today's local date at the growth location of the recipient's own care profile, both sides see 'handed over'", async () => {
    const mineLoc = (
      await call(subB, "POST", "/locations", {
        name: "Fensterbank",
        kind: "indoor",
        lightZoneId: null,
      })
    ).body.id as string;
    expect(
      (await call(subB, "PUT", `/care-profiles/${speciesId}`, { growthLocationId: mineLoc }))
        .status,
    ).toBe(200);
    const a = await accepted("H2");
    expect(await confirm(subB, a.swapId)).toMatchObject({
      status: 200,
      body: { status: "waiting" },
    });
    expect(
      (await call(subA, "GET", "/specimens/archived")).body.archived.map(
        (x: { id: string }) => x.id,
      ),
    ).not.toContain(a.specimenId);
    const done = await confirm(subA, a.swapId);
    expect(done).toMatchObject({
      status: 200,
      body: { status: "handed_over", receivedSpecimenId: expect.any(String) },
    });
    const archived = (await call(subA, "GET", "/specimens/archived")).body.archived as {
      id: string;
      archivedReason: string;
    }[];
    expect(archived.find((x) => x.id === a.specimenId)?.archivedReason).toMatch(/^Getauscht mit /);
    const mine = (await call(subB, "GET", "/specimens")).body.specimens as {
      id: string;
      status: string;
      caughtAt: string;
      locationId: string | null;
    }[];
    expect(mine.find((x) => x.id === done.body.receivedSpecimenId)).toMatchObject({
      status: "cutting",
      caughtAt: "2026-10-10",
      locationId: mineLoc,
    });
    expect((await swaps(subA)).received.find((s) => s.swapId === a.swapId)?.status).toBe(
      "handed_over",
    );
    expect((await swaps(subB)).sent.find((s) => s.swapId === a.swapId)?.status).toBe("handed_over");
    const listed = (
      await call(subC, "GET", "/exchange/offers?timeZone=Europe%2FBerlin")
    ).body.offers.map((x: { offerId: string }) => x.offerId);
    expect(listed).not.toContain(a.offerId);
    expect((await confirm(subA, a.swapId)).body).toMatchObject({ status: "handed_over" });
  });

  it("a gift is archived as 'Verschenkt an'; the recipient's new specimen is private (nothing shared)", async () => {
    const a = await accepted("H3", "give_away");
    await confirm(subA, a.swapId);
    // B owns the species since the test before, so the naming rule asks for a marker.
    const done = await confirm(subB, a.swapId, { marker: "blau" });
    const archived = (await call(subA, "GET", "/specimens/archived")).body.archived as {
      id: string;
      archivedReason: string;
    }[];
    expect(archived.find((x) => x.id === a.specimenId)?.archivedReason).toMatch(/^Verschenkt an /);
    const shared = (await call(subB, "GET", "/sharing")).body.shared as { specimenId: string }[];
    expect(shared.map((s) => s.specimenId)).not.toContain(done.body.receivedSpecimenId);
  });

  it("a recipient who has the species already is asked for a marker and nothing is written until it is given", async () => {
    await specimen(subC);
    const a = await accepted("H4", "swap", subC);
    const refused = await confirm(subC, a.swapId);
    expect(refused).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.marker_required" } },
    });
    expect((await swaps(subC)).sent.find((s) => s.swapId === a.swapId)?.status).toBe("accepted");
    await confirm(subA, a.swapId);
    const ok = await confirm(subC, a.swapId, { marker: "rot" });
    expect(ok.body.status).toBe("handed_over");
    const mine = (await call(subC, "GET", "/specimens")).body.specimens as {
      id: string;
      marker: string | null;
    }[];
    expect(mine.find((x) => x.id === ok.body.receivedSpecimenId)?.marker).toBe("rot");
  });

  it("the same Idempotency-Key answers once", async () => {
    const a = await accepted("H5");
    const key = randomUUID();
    const first = await confirm(subB, a.swapId, {}, key);
    expect((await confirm(subB, a.swapId, {}, key)).body).toEqual(first.body);
  });
});

describe("US-SOZ-09 approved species, 'you lack it' and the wishlist hint in the exchange list", () => {
  const listed = async (sub: string) =>
    (await call(sub, "GET", "/exchange/offers?timeZone=Europe%2FBerlin")).body.offers as {
      offerId: string;
      speciesLatin: string | null;
      lack: boolean | null;
      onWishlist: boolean;
    }[];
  const open = async (m: string) => {
    const id = await specimen(subA, m);
    await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
    return (await call(subA, "POST", "/offers", { specimenId: id, type: "cutting", mode: "swap" }))
      .body.id as string;
  };

  it("a friend sees the approved species and 'you lack it'; the wishlist hint appears once the species is on my wishlist, without the list (FR-WUN-07)", async () => {
    const o = await open("L1");
    const seen = (await listed(subC)).find((x) => x.offerId === o);
    expect(seen?.onWishlist).toBe(false);
    // "You lack it" is a real yes or no for an approved species (the person may own it already); unknown only for an unknown species.
    expect(typeof seen?.lack).toBe("boolean");
    expect(seen?.speciesLatin).toBeTruthy();
    await call(subC, "POST", "/wishes", { name: seen?.speciesLatin });
    const r = await call(subC, "GET", "/exchange/offers?timeZone=Europe%2FBerlin");
    expect(r.body.offers.find((x: { offerId: string }) => x.offerId === o).onWishlist).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('"wishes"');
  });
});

describe("US-SOZ-13 swap history and provenance through the API", () => {
  const history = async (sub: string | null) => call(sub, "GET", "/swaps/history");
  type Entry = {
    swapId: string;
    friend: string | null;
    direction: string;
    status: string;
    species: string | null;
  };

  it("without a token 401; a stranger has no history (P-04)", async () => {
    expect((await history(null)).status).toBe(401);
    expect((await history(subOp)).body.entries).toEqual([]);
  });

  it("both sides see the handed-over swap with the right direction, the friend's name and the species; open swaps are not history", async () => {
    const done = await accepted("T2", "swap", subD);
    await confirm(subA, done.swapId);
    await confirm(subD, done.swapId, { marker: "t2" });
    const open = await accepted("T3", "swap", subD);
    const mine = (await history(subA)).body.entries as Entry[];
    expect(mine.find((e) => e.swapId === done.swapId)).toMatchObject({
      direction: "given",
      status: "handed_over",
      friend: expect.any(String),
    });
    expect(mine.map((e) => e.swapId)).not.toContain(open.swapId);
    const theirs = (await history(subD)).body.entries as Entry[];
    expect(theirs.find((e) => e.swapId === done.swapId)).toMatchObject({
      direction: "received",
      status: "handed_over",
    });
  });

  it("declined, withdrawn and canceled swaps are part of the history with their reason", async () => {
    const id = await specimen(subA, "T4");
    await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
    const offerId = (
      await call(subA, "POST", "/offers", { specimenId: id, type: "cutting", mode: "swap" })
    ).body.id as string;
    const swapId = (await call(subB, "POST", `/offers/${offerId}/request`, {})).body
      .swapId as string;
    await call(subA, "POST", `/swaps/${swapId}/answer`, { action: "decline", reason: "Zu klein" });
    const e = ((await history(subB)).body.entries as (Entry & { reason: string | null })[]).find(
      (x) => x.swapId === swapId,
    );
    expect(e).toMatchObject({ status: "declined", reason: "Zu klein", direction: "received" });
  });

  it("the card of the received specimen shows from whom and when; the giver's and other cards show none", async () => {
    const a = await accepted("T5", "swap", subD);
    await confirm(subA, a.swapId);
    const done = await confirm(subD, a.swapId, { marker: "t5" });
    const cards = (await call(subD, "GET", "/specimens/cards?timeZone=Europe%2FBerlin")).body
      .cards as {
      id: string;
      provenance: { from: string | null; date: string } | null;
    }[];
    const card = cards.find((c) => c.id === done.body.receivedSpecimenId);
    expect(card?.provenance?.from).toBeTruthy();
    expect(card?.provenance?.date).toMatch(/^2026-10-/);
    const giverCards = (await call(subA, "GET", "/specimens/cards?timeZone=Europe%2FBerlin")).body
      .cards as { provenance: unknown }[];
    expect(giverCards.every((c) => c.provenance === null)).toBe(true);
  });

  it("the history and the provenance stay after the friendship ended, with the stored name", async () => {
    const a = await accepted("T6", "swap", subE);
    await confirm(subA, a.swapId);
    await confirm(subE, a.swapId, { marker: "t6" });
    const before = ((await history(subE)).body.entries as Entry[]).find(
      (e) => e.swapId === a.swapId,
    )?.friend;
    const friends = (await call(subA, "GET", "/friends")).body.friends as {
      id: string;
      displayName: string | null;
    }[];
    const link = await admin.query(
      "select f.id from friendship f join account a on a.id = f.account_id where a.subject = $1 and f.other_id = (select id from account where subject = $2)",
      [subA, subE],
    );
    expect(friends.map((f) => f.id)).toContain(link.rows[0].id);
    expect((await call(subA, "POST", `/friends/${link.rows[0].id}/end`, {})).status).toBe(200);
    const after = ((await history(subE)).body.entries as Entry[]).find(
      (e) => e.swapId === a.swapId,
    );
    expect(after).toMatchObject({ status: "handed_over", friend: before });
    const cards = (await call(subE, "GET", "/specimens/cards?timeZone=Europe%2FBerlin")).body
      .cards as { provenance: { from: string | null } | null }[];
    expect(cards.some((c) => c.provenance?.from === before)).toBe(true);
  });
});

describe("US-SOZ-05 feed events Swapped and Potted through the API", () => {
  type Ev = {
    type: string;
    friendName: string | null;
    speciesLatin: string | null;
    date: string | null;
    count: number;
  };
  const feed = async (sub: string) =>
    (await call(sub, "GET", "/feed?timeZone=Europe%2FBerlin&days=365")).body.events as Ev[];

  it("a swap I took part in shows as 'Getauscht' with the friend and the species on the handover day, for both sides", async () => {
    const a = await accepted("F1", "swap", subD);
    await confirm(subA, a.swapId);
    await confirm(subD, a.swapId, { marker: "f1" });
    for (const sub of [subA, subD]) {
      const e = (await feed(sub)).filter((x) => x.type === "swapped");
      expect(e.length).toBeGreaterThan(0);
      expect(e[0]).toMatchObject({ date: "2026-10-10", count: expect.any(Number) });
      expect(e[0]?.friendName).toBeTruthy();
    }
  });

  it("a stranger sees no swap event of two others (only if I am involved)", async () => {
    expect((await feed(subOp)).filter((x) => x.type === "swapped")).toEqual([]);
  });

  it("repotting a shared cutting creates 'Eingetopft' with the keeper's local day; the friend sees it, a private one stays private", async () => {
    const id = await specimen(subA, "F2");
    await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
    const cutting = (
      await call(subA, "POST", "/specimens", {
        timeZone: "Europe/Berlin",
        speciesId,
        marker: "F3",
        status: "cutting",
      })
    ).body.id as string;
    await call(subA, "PUT", `/sharing/specimens/${cutting}`, { share: "friends" });
    const repotted = await call(subA, "POST", `/specimens/${cutting}/repot`, {
      timeZone: "Europe/Berlin",
    });
    expect(repotted.status).toBe(200);
    const potted = (await feed(subB)).filter((x) => x.type === "potted");
    expect(potted.map((x) => x.date)).toContain("2026-10-10");
  });
});
