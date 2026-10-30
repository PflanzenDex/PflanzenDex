import {
  ensureSpecimens,
  shareSpecimens,
  speciesByLatin,
  TZ,
  type Ctx,
  type Id,
} from "../../accounts/common/shared.ts";
import { ensureOffer } from "../../accounts/common/social.ts";
import { locationsOf, must, specimenOf } from "../helpers.ts";

// Friends, the feed, swap offers and swaps beyond the base seed (US-SOZ-02, US-SOZ-05, US-SOZ-08 to US-SOZ-10,
// US-TAU-01 to US-TAU-05, US-ACH-03). Each step looks at the current state first, so a second run changes nothing.

type Request = { id: Id; otherName: string };
type Side = {
  swapId: Id;
  offerId: Id;
  status: string;
  confirmedGiver: boolean;
  confirmedRecipient: boolean;
};

/** Anna declines Ben's request: Ben sees "Nicht angenommen" (US-SOZ-02). Ends the pending state of the base seed. */
export async function declineBen(anna: Ctx): Promise<void> {
  const incoming = ((await anna.api.ok(anna.sub, "GET", "/friends/requests"))["incoming"] ??
    []) as Request[];
  const request = incoming.find((r) => r.otherName === "Ben");
  if (request)
    await anna.api.ok(anna.sub, "POST", `/friends/requests/${request.id}/answer`, {
      decision: "decline",
    });
}

/**
 * The feed (US-SOZ-05, US-SOZ-06): Anna's first visit is marked silently, then Clara shares a new cutting, so Anna's
 * banner counts it ("Freunde haben 1 neue Pflanze"). Clara's cutting is new and shared with friends.
 */
export async function friendNews(anna: Ctx, clara: Ctx): Promise<void> {
  // The first visit is created silently by "Okay" on the banner (POST /feed/seen, US-SOZ-06), before Clara's share.
  const banner = await anna.api.ok(anna.sub, "GET", "/feed/banner");
  if (banner["firstVisit"] === true)
    await anna.api.ok(anna.sub, "POST", "/feed/seen", { upTo: banner["asOf"] });
  const latin = "Zamioculcas zamiifolia";
  const species = await speciesByLatin(clara, [latin]);
  const made = await ensureSpecimens(clara, species, await locationsOf(clara), [
    { latin, marker: "Ableger", status: "cutting", location: "Stecklingsglas", caughtDaysAgo: 1 },
  ]);
  await shareSpecimens(clara, [...made.values()]);
}

/**
 * Anna offers her Monstera (US-SOZ-08): Clara has the plant on her wishlist (a match card with a fit reason).
 */
export async function annaOffer(anna: Ctx): Promise<void> {
  const monstera = await specimenOf(anna, "Monstera deliciosa");
  await ensureOffer(anna, monstera, {
    type: "plant",
    mode: "give_away",
    note: "Ein Trieb mit Luftwurzeln, gut bewurzelt.",
  });
}

/**
 * Ben offers his Philodendron with the moss stick (US-TAU-01): on Clara's deck it matches her wishlist ("On your
 * wishlist: Philodendron hederaceum"), and it "fits both ways" once Ben has an open request on one of Clara's offers.
 */
export async function benMoosstabOffer(ben: Ctx): Promise<void> {
  const moosstab = await specimenOf(ben, "Philodendron hederaceum", "Moosstab");
  await shareSpecimens(ben, [moosstab]);
  await ensureOffer(ben, moosstab, {
    type: "plant",
    mode: "swap",
    wish: "Einen Kakteen-Ableger",
    note: "Gesund, mit Moosstab.",
  });
}

const sentBy = async (ctx: Ctx): Promise<Side[]> =>
  (await ctx.api.ok(ctx.sub, "GET", `/swaps?timeZone=${TZ}`))["sent"] as Side[];
const receivedBy = async (ctx: Ctx): Promise<Side[]> =>
  (await ctx.api.ok(ctx.sub, "GET", `/swaps?timeZone=${TZ}`))["received"] as Side[];

const offerOf = async (owner: Ctx, latin: string, marker: string): Promise<Id> => {
  const specimen = await specimenOf(owner, latin, marker);
  const mine = (await owner.api.ok(owner.sub, "GET", `/offers?timeZone=${TZ}`))["offers"] as {
    id: Id;
    specimenId: Id;
  }[];
  return must(mine, (o) => o.specimenId === specimen, `${owner.name}'s offer of ${latin}`).id;
};

/** `asker` requests `offerId` once and returns the side (the request stays open for the offering account). */
async function requestOnce(asker: Ctx, offerId: Id): Promise<Side> {
  const have = (await sentBy(asker)).find((s) => s.offerId === offerId);
  if (have) return have;
  await asker.api.ok(asker.sub, "POST", `/offers/${offerId}/request`, {});
  return must(await sentBy(asker), (s) => s.offerId === offerId, "the request");
}

/**
 * Swaps beyond the base seed, all on Ben's and Clara's accounts. Base-seed specimens that change owner would break a
 * second base run (the handed-over row keeps its marker), so the handover uses a cutting that only this step creates:
 * - Ben's Dracaena cutting is requested by Clara, accepted and handed over on both sides. Ben earns "Erste Übergabe"
 *   after his first visit to the achievements (US-ACH-03): the banner "Erfolg: Erste Übergabe" stays until "Okay".
 * - Ben requests Clara's Tradescantia cutting and the request stays open: on Clara's deck Ben's offers "fit both ways".
 * - Ben requests Clara's Hoya cutting, Clara accepts and confirms her side only: "wartet auf Erhalt" (one-sided).
 */
export async function swapStates(ben: Ctx, clara: Ctx): Promise<void> {
  const done = (await ben.api.ok(ben.sub, "GET", "/swaps/history"))["entries"] as {
    status: string;
  }[];
  if (!done.some((e) => e.status === "handed_over")) {
    const latin = "Dracaena fragrans";
    const cutting = (
      await ensureSpecimens(ben, await speciesByLatin(ben, [latin]), await locationsOf(ben), [
        {
          latin,
          marker: "Ableger",
          status: "cutting",
          location: "Stecklingsbox",
          caughtDaysAgo: 4,
        },
      ])
    ).get(`${latin}|Ableger`);
    if (!cutting) throw new Error("demo seed states: Ben's Dracaena cutting is missing");
    await shareSpecimens(ben, [cutting]);
    const offer = await ensureOffer(ben, cutting, {
      type: "cutting",
      mode: "give_away",
      note: "Bewurzelt, zum Verschenken.",
    });
    if (!offer) throw new Error("demo seed states: Ben's Dracaena offer is missing");
    const side = await requestOnce(clara, offer);
    if (side.status === "requested")
      await ben.api.ok(ben.sub, "POST", `/swaps/${side.swapId}/answer`, { action: "accept" });
    // The first visit to the achievements writes the seen state (US-ACH-03), so the handover is "new" afterwards.
    const news = await ben.api.ok(ben.sub, "GET", `/achievements/news?timeZone=${TZ}`);
    if (news["needsWrite"] === true)
      await ben.api.ok(ben.sub, "POST", "/achievements/seen", {
        achievements: (news["acknowledge"] ?? []) as string[],
        timeZone: TZ,
      });
    await ben.api.ok(ben.sub, "POST", `/swaps/${side.swapId}/handover`, { timeZone: TZ });
    await clara.api.ok(clara.sub, "POST", `/swaps/${side.swapId}/handover`, { timeZone: TZ });
  }

  const tradescantia = await offerOf(clara, "Tradescantia zebrina", "Ableger");
  await requestOnce(ben, tradescantia);

  const hoya = await offerOf(clara, "Hoya carnosa", "Ableger");
  const hoyaSide = await requestOnce(ben, hoya);
  if (hoyaSide.status === "requested")
    await clara.api.ok(clara.sub, "POST", `/swaps/${hoyaSide.swapId}/answer`, { action: "accept" });
  const accepted = (await receivedBy(clara)).find((s) => s.offerId === hoya);
  if (accepted && !accepted.confirmedGiver)
    await clara.api.ok(clara.sub, "POST", `/swaps/${accepted.swapId}/handover`, { timeZone: TZ });
}
