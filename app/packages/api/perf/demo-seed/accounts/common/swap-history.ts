import { ensureOffer } from "./social.ts";
import {
  ensureSpecimens,
  shareSpecimens,
  speciesByLatin,
  TZ,
  type Ctx,
  type Id,
} from "./shared.ts";

// The swap history (#943, US-SOZ-13): Clara gives Anna a Peperomia cutting (requested, accepted, handed over by both,
// so Anna has a received specimen with its provenance and the feed shows the swap) and declines Anna's request for her
// Hoya cutting with a reason. Each step looks at Anna's side of the swaps first, so a second run changes nothing.
const GIFT = { latin: "Peperomia obtusifolia", marker: "Steckling" } as const;
const DECLINE_REASON = "Der Ableger ist Ben schon halb versprochen.";

type Side = {
  swapId: Id;
  offerId: Id;
  speciesLatin: string | null;
  status: string;
  confirmedGiver: boolean;
  confirmedRecipient: boolean;
};

const sentBy = async (ctx: Ctx): Promise<Side[]> =>
  (await ctx.api.ok(ctx.sub, "GET", `/swaps?timeZone=${TZ}`))["sent"] as Side[];

const answer = (ctx: Ctx, swapId: Id, body: Record<string, string>) =>
  ctx.api.ok(ctx.sub, "POST", `/swaps/${swapId}/answer`, body);

/** `asker` requests `offerId` unless they already have a swap for it; returns their side. */
async function requestOnce(asker: Ctx, offerId: Id): Promise<Side> {
  const have = (await sentBy(asker)).find((s) => s.offerId === offerId);
  if (have) return have;
  await asker.api.ok(asker.sub, "POST", `/offers/${offerId}/request`, {});
  const made = (await sentBy(asker)).find((s) => s.offerId === offerId);
  if (!made) throw new Error(`demo seed: the request for offer ${offerId} is missing`);
  return made;
}

async function handOverGift(giver: Ctx, recipient: Ctx): Promise<void> {
  const done = (await sentBy(recipient)).some(
    (s) => s.speciesLatin === GIFT.latin && s.status === "handed_over",
  );
  if (done) return; // the cutting is archived at Clara after the handover, so it is not created again
  const species = await speciesByLatin(giver, [GIFT.latin]);
  const locations = (await giver.api.ok(giver.sub, "GET", "/locations"))["locations"] as {
    id: Id;
    name: string;
  }[];
  const glass = new Map(locations.map((l) => [l.name, l.id]));
  const cutting = (
    await ensureSpecimens(giver, species, glass, [
      { ...GIFT, status: "cutting", location: "Stecklingsglas", caughtDaysAgo: 20 },
    ])
  ).get(`${GIFT.latin}|${GIFT.marker}`);
  if (!cutting) throw new Error("demo seed: Clara's Peperomia cutting is missing");
  await shareSpecimens(giver, [cutting]);
  const offer = await ensureOffer(giver, cutting, {
    type: "cutting",
    mode: "give_away",
    note: "Hat schon Wurzeln, zum Verschenken.",
  });
  if (!offer) throw new Error("demo seed: Clara's give-away offer is missing");
  let side = await requestOnce(recipient, offer);
  if (side.status === "requested") await answer(giver, side.swapId, { action: "accept" });
  side = (await sentBy(recipient)).find((s) => s.swapId === side.swapId) ?? side;
  if (!side.confirmedGiver)
    await giver.api.ok(giver.sub, "POST", `/swaps/${side.swapId}/handover`, { timeZone: TZ });
  if (!side.confirmedRecipient)
    await recipient.api.ok(recipient.sub, "POST", `/swaps/${side.swapId}/handover`, {
      timeZone: TZ,
    });
}

/** A handed-over and a declined swap between Clara (giver) and Anna, after both are friends and Clara's offers exist. */
export async function seedSwapHistory(giver: Ctx, recipient: Ctx, declineOffer: Id): Promise<void> {
  await handOverGift(giver, recipient);
  const side = await requestOnce(recipient, declineOffer);
  if (side.status === "requested")
    await answer(giver, side.swapId, { action: "decline", reason: DECLINE_REASON });
  giver.log(
    `Swap history: ${giver.name} gave ${recipient.name} a cutting and declined one request.`,
  );
}
