import { appError, failed, isTimeZone, ok, type Result } from "../../../kernel";
import { offerHealth } from "../../offer/read/health";
import { OFFER_TYPES, type OfferType } from "../../offer";
import type { ExchangeDependencies, ExchangeOffer, FriendOffer } from "../types";

export interface ExchangeQuery {
  readonly timeZone?: unknown;
  /** Only this type (`cutting | plant | offshoot`). */
  readonly type?: unknown;
  /** `"true"`: only species I lack. */
  readonly lack?: unknown;
}

const invalid = (field: string) =>
  failed(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));

interface Filters {
  readonly type: OfferType | null;
  readonly lack: boolean;
}

function filtersOf(q: ExchangeQuery): Filters | "type" | "lack" {
  const type = q.type === undefined || q.type === "" ? null : q.type;
  if (type !== null && !(OFFER_TYPES as readonly unknown[]).includes(type)) return "type";
  if (q.lack !== undefined && q.lack !== "" && q.lack !== "true" && q.lack !== "false")
    return "lack";
  return { type: type as OfferType | null, lack: q.lack === "true" };
}

type Fact = { name: string; speciesLatin: string | null; speciesGerman: string | null };

/** The facts of the released specimens, each asked as its owner (the database released the offer, P-05). */
async function factsOf(deps: ExchangeDependencies, offers: readonly FriendOffer[]) {
  const byOwner = new Map<string, string[]>();
  for (const o of offers) byOwner.set(o.ownerId, [...(byOwner.get(o.ownerId) ?? []), o.specimenId]);
  const out = new Map<string, Fact>();
  for (const [owner, ids] of byOwner)
    for (const f of await deps.facts.describe(owner, ids)) out.set(f.id, f);
  return out;
}

/**
 * The exchange list (US-SOZ-09): open offers of confirmed friends with species, type, mode, health details, the care
 * phase, the chip "you lack it" and a hint when the species is on the own wishlist. What a friend shows is decided by
 * the database (`friend_offers()`: confirmed friendship, `Share = friends`, nothing while the owner is "Everything
 * private"); health shows reason and date only, never agent or note (P-05). "You lack it" compares with the species I
 * have caught and stays unknown for a species without a name (P-08). The wishlist is asked per species and never
 * transmitted (FR-WUN-07). Filters: `type` and `lack=true`.
 */
export async function exchangeList(
  deps: ExchangeDependencies,
  userId: string,
  query: ExchangeQuery,
): Promise<Result<{ readonly offers: readonly ExchangeOffer[] }>> {
  if (!isTimeZone(query.timeZone)) return invalid("timeZone");
  const filters = filtersOf(query);
  if (typeof filters === "string") return invalid(filters);
  const [released, mySwaps, caught] = await Promise.all([
    deps.swaps.friendOffers(userId),
    deps.swaps.list(userId),
    deps.mine.latinNamesOf(userId),
  ]);
  const facts = await factsOf(deps, released);
  const latin = [...facts.values()].flatMap((f) => (f.speciesLatin ? [f.speciesLatin] : []));
  const wished = await deps.wishes.onWishlist(userId, [...new Set(latin)]);
  const mine = new Set(caught);
  const requested = new Set(
    mySwaps
      .filter(
        (s) => s.role === "recipient" && (s.status === "requested" || s.status === "accepted"),
      )
      .map((s) => s.offerId),
  );
  const offers = await Promise.all(
    released.map(async (o): Promise<ExchangeOffer> => {
      const fact = facts.get(o.specimenId);
      const name = fact?.speciesLatin ?? null;
      return {
        ...o,
        specimenName: fact?.name ?? null,
        speciesLatin: name,
        speciesGerman: fact?.speciesGerman ?? null,
        health: await offerHealth(deps, o.ownerId, o.specimenId),
        phase: await deps.phases.phaseOf(o.ownerId, o.specimenId, query.timeZone as string),
        lack: name === null ? null : !mine.has(name),
        onWishlist: name !== null && wished.has(name),
        requested: requested.has(o.offerId),
      };
    }),
  );
  const shown = offers.filter(
    (o) => (filters.type === null || o.type === filters.type) && (!filters.lack || o.lack === true),
  );
  return ok({ offers: shown });
}
