import { SEED_SPECIES } from "../../../catalog-seed/species-list.ts";
import type { Ctx, Id } from "../../accounts/common/shared.ts";
import { must, zonesOf } from "../helpers.ts";

// Wishlist history and hints (US-WUN-02, US-WUN-03, US-WUN-05, FR-WUN-03) and the long list for the pager. Clara is
// the keeper with the wishes; the base seed already made six of them.

type Wish = { id: Id; name: string };

/** Open, bought and discarded wishes of the account by name, with their ids (open only: what can be bought). */
async function wishesOf(ctx: Ctx): Promise<{ open: Map<string, Id>; names: Set<string> }> {
  const open = ((await ctx.api.ok(ctx.sub, "GET", "/wishes/candidates"))["candidates"] ??
    []) as Wish[];
  const bought = ((await ctx.api.ok(ctx.sub, "GET", "/wishes/bought"))["bought"] ?? []) as Wish[];
  const discarded = ((await ctx.api.ok(ctx.sub, "GET", "/wishes/discarded"))["discarded"] ??
    []) as Wish[];
  return {
    open: new Map(open.map((w) => [w.name, w.id])),
    names: new Set([...open, ...bought, ...discarded].map((w) => w.name)),
  };
}

/** Creates a wish unless one with that name exists in any state (a bought or discarded wish keeps its name). */
async function ensureWish(ctx: Ctx, name: string, zoneId?: Id): Promise<void> {
  if ((await wishesOf(ctx)).names.has(name)) return;
  await ctx.api.ok(ctx.sub, "POST", "/wishes", {
    name,
    ...(zoneId ? { targetZoneId: zoneId } : {}),
  });
}

/** Clara's wishlist states: bought (with the path to a specimen), discarded, no zone, zone 1 (unsuitable), and a long list. */
export async function claraWishes(clara: Ctx): Promise<void> {
  const zones = await zonesOf(clara);
  const zone = (name: string): Id => must([...zones.entries()], ([n]) => n === name, name)[1];
  const zone1 = zone("Zone 1 · Stecklingslicht");
  const zone2 = zone("Zone 2");
  const zone3 = zone("Zone 3");
  // Bought and discarded wishes are names the profile creates itself: the base seed looks its own names up among the
  // open wishes, so a bought base wish would be created again on a second run.
  await ensureWish(clara, "Anthurium crystallinum", zone2);
  await ensureWish(clara, "Philodendron gloriosum", zone2);
  await ensureWish(clara, "Monstera deliciosa", zone3);
  await ensureWish(clara, "Pilea glauca", zone1); // zone 1 is cutting light: "Ungeeignete Wünsche"
  await ensureWish(clara, "Peperomia prostrata"); // no zone: last in the list, and says so
  const owned = new Set([
    "Hoya carnosa",
    "Tradescantia zebrina",
    "Peperomia obtusifolia",
    "Chlorophytum comosum",
  ]);
  for (const [latin] of SEED_SPECIES) if (!owned.has(latin)) await ensureWish(clara, latin, zone2);

  const before = await wishesOf(clara);
  const bought = before.open.get("Anthurium crystallinum");
  if (bought) await clara.api.ok(clara.sub, "POST", `/wishes/${bought}/buy`, {});
  const discarded = before.open.get("Philodendron gloriosum");
  if (discarded) await clara.api.ok(clara.sub, "POST", `/wishes/${discarded}/discard`, {});
}
