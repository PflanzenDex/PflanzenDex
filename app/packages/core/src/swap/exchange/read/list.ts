import type { CarePhase } from "../../../care";
import { appError, failed, isTimeZone, ok, type Result } from "../../../kernel";
import { NO_OFFER_HEALTH, healthOf } from "../../offer/read/health";
import { OFFER_TYPES, type OfferHealth, type OfferType } from "../../offer";
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

/** What the released offers need from their owners, by specimen ID. */
interface OwnerReads {
  readonly facts: ReadonlyMap<string, Fact>;
  readonly health: ReadonlyMap<string, OfferHealth>;
  readonly phases: ReadonlyMap<string, CarePhase>;
}

/**
 * The facts, health and phase of the released specimens, each asked as its owner (the database released the offer, P-05):
 * one read per owner for all of its offers, so the statements grow with the owners, never with the offers (NFR-12).
 * The phases run after the facts of their owner: the wiring shares the owner's species read between the two, so the
 * species are read once per owner (NFR-12). The health is read alongside the facts.
 */
async function readOwners(
  deps: ExchangeDependencies,
  offers: readonly FriendOffer[],
  timeZone: string,
): Promise<OwnerReads> {
  const byOwner = new Map<string, string[]>();
  for (const o of offers) byOwner.set(o.ownerId, [...(byOwner.get(o.ownerId) ?? []), o.specimenId]);
  const facts = new Map<string, Fact>();
  const health = new Map<string, OfferHealth>();
  const phases = new Map<string, CarePhase>();
  for (const [owner, ids] of byOwner) {
    const [described, healthOfOwner] = await Promise.all([
      deps.facts.describe(owner, ids),
      healthOf(deps, owner, ids),
    ]);
    const phasesOfOwner = await deps.phases.phasesOf(owner, ids, timeZone);
    for (const f of described) facts.set(f.id, f);
    for (const [id, h] of healthOfOwner) health.set(id, h);
    for (const [id, p] of phasesOfOwner) phases.set(id, p);
  }
  return { facts, health, phases };
}

/** The names of a released specimen as the exchange list shows them; unknown names stay `null` (P-08). */
const namesOf = (fact: Fact | undefined) => ({
  specimenName: fact?.name ?? null,
  speciesLatin: fact?.speciesLatin ?? null,
  speciesGerman: fact?.speciesGerman ?? null,
});

/** The caller's own marks on the species: caught, on the wishlist, and the offers the caller already requested. */
interface OwnMarks {
  readonly caught: ReadonlySet<string>;
  readonly wished: ReadonlySet<string>;
  readonly requested: ReadonlySet<string>;
}

/** One released offer with what is derived on every read (P-01): species, health, phase and the chips of the caller. */
function exchangeOffer(o: FriendOffer, reads: OwnerReads, marks: OwnMarks): ExchangeOffer {
  const names = namesOf(reads.facts.get(o.specimenId));
  const name = names.speciesLatin;
  return {
    ...o,
    ...names,
    health: reads.health.get(o.specimenId) ?? NO_OFFER_HEALTH,
    phase: reads.phases.get(o.specimenId) ?? null,
    lack: name === null ? null : !marks.caught.has(name),
    onWishlist: name !== null && marks.wished.has(name),
    requested: marks.requested.has(o.offerId),
  };
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
  const reads = await readOwners(deps, released, query.timeZone as string);
  const latin = [...reads.facts.values()].flatMap((f) => (f.speciesLatin ? [f.speciesLatin] : []));
  const wished = await deps.wishes.onWishlist(userId, [...new Set(latin)]);
  const mine = new Set(caught);
  const requested = new Set(
    mySwaps
      .filter(
        (s) => s.role === "recipient" && (s.status === "requested" || s.status === "accepted"),
      )
      .map((s) => s.offerId),
  );
  const offers = released.map((o) => exchangeOffer(o, reads, { caught: mine, wished, requested }));
  const shown = offers.filter(
    (o) => (filters.type === null || o.type === filters.type) && (!filters.lack || o.lack === true),
  );
  return ok({ offers: shown });
}
