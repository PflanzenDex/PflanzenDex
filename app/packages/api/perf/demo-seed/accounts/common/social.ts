import type { Ctx, Id } from "./shared.ts";

// Friendships, offers and one open swap request, all through the routes the app uses (invitation code, request,
// answer; offer, request). Each step looks at the current state first, so a second run changes nothing.
type Friend = { id: Id; name: string };
type Request = { id: Id; otherName: string };

const friendsOf = async (ctx: Ctx): Promise<Friend[]> =>
  (await ctx.api.ok(ctx.sub, "GET", "/friends"))["friends"] as Friend[];

/** `from` invites `to` with a code; `to` redeems it; with `accept`, `from` accepts. Skipped when linked or pending. */
export async function befriend(from: Ctx, to: Ctx, accept: boolean): Promise<void> {
  if ((await friendsOf(from)).some((f) => f.name === to.name)) return;
  const mine = (await from.api.ok(from.sub, "GET", "/friends/requests")) as Record<
    string,
    Request[]
  >;
  const open = [...(mine["incoming"] ?? []), ...(mine["outgoing"] ?? [])];
  if (open.some((r) => r.otherName === to.name)) return; // an open request between the two is left as it is
  const { code } = await from.api.ok(from.sub, "POST", "/friends/invitations", {});
  await to.api.ok(to.sub, "POST", "/friends/requests", { code });
  if (!accept) return;
  const incoming = (await from.api.ok(from.sub, "GET", "/friends/requests"))[
    "incoming"
  ] as Request[];
  const first = incoming.find((r) => r.otherName === to.name) ?? incoming[0];
  if (first)
    await from.api.ok(from.sub, "POST", `/friends/requests/${first.id}/answer`, {
      decision: "accept",
    });
}

type Offer = { id: Id; specimenId?: Id };

/** Offers a (shared) specimen for a swap unless it is offered already; returns the offer id. */
export async function ensureOffer(
  ctx: Ctx,
  specimenId: Id,
  offer: {
    type: "cutting" | "plant" | "offshoot";
    mode: "swap" | "give_away";
    wish?: string;
    note?: string;
  },
): Promise<Id | undefined> {
  const mine = await ctx.api.ok(ctx.sub, "GET", "/offers?timeZone=Europe/Berlin");
  const have = ((mine["offers"] ?? []) as (Offer & { status?: string })[]).find(
    (o) => o.specimenId === specimenId,
  );
  if (have) return have.id;
  const made = await ctx.api.ok(ctx.sub, "POST", "/offers", { specimenId, ...offer });
  return made["id"] as Id;
}

/** `ctx` asks for somebody's offer, once (the request stays open for the offering account to answer). */
export async function ensureRequest(
  ctx: Ctx,
  offerId: Id,
  counterSpecimenId: Id | null,
): Promise<void> {
  const swaps = await ctx.api.ok(ctx.sub, "GET", "/swaps?timeZone=Europe/Berlin");
  if (JSON.stringify(swaps).includes(offerId)) return;
  await ctx.api.ok(
    ctx.sub,
    "POST",
    `/offers/${offerId}/request`,
    counterSpecimenId ? { counterSpecimenId } : {},
  );
}
