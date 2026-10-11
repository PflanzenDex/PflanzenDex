import type { FriendStore } from "../../friendship";
import { friendView, type FriendViewDependencies } from "../../sharing";
import { localToday } from "../../../kernel";
import { daysBetween, deriveEvents, swappedEvents, type SwappedFact } from "./derive";
import { FEED_DAYS, type Feed, type FeedEvent, type FeedQuery } from "../types";

/**
 * Port: the handed-over swaps the viewer took part in (US-SOZ-11); the app root fills it from `swap` (ADR 0012: `social`
 * never imports `swap`). Each account reads only its own swap rows (P-04).
 */
export interface SwappedSource {
  handedOver(userId: string): Promise<readonly SwappedFact[]>;
}

export interface FeedDependencies extends FriendViewDependencies {
  readonly friends: FriendStore;
  /** Handed-over swaps of the viewer for the event "Swapped"; without it there are none. */
  readonly swapped?: SwappedSource;
  /** The clock, for `asOf`; `core` has no I/O. */
  readonly now: () => Date;
}

const text = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
/** Dated events first, newest first; then by friend name and species. */
const order = (a: FeedEvent, b: FeedEvent) =>
  Number(a.date === null) - Number(b.date === null) ||
  text(b.date, a.date) ||
  text(a.friendName, b.friendName) ||
  text(a.speciesLatin, b.speciesLatin);

/** Whether the event lies within `days` calendar days back from today (today counts); an unknown date is always listed. */
const inPeriod = (e: FeedEvent, q: FeedQuery) => {
  if (e.date === null) return true;
  const age = daysBetween(e.date, q.today);
  return age >= 0 && age < (q.days ?? FEED_DAYS);
};

function hintFor(friends: number, events: number, shared: number): Feed["hint"] {
  if (friends === 0)
    return {
      text: "Du hast noch keine Freunde.",
      nextAction: "Lade jemanden mit einem Code ein oder gib einen erhaltenen Code ein.",
    };
  if (shared === 0)
    return {
      text: "Deine Freunde haben noch nichts freigegeben.",
      nextAction:
        "Bitte sie, Exemplare unter „Was Freunde sehen“ freizugeben, und gib selbst etwas frei.",
    };
  if (events === 0)
    return {
      text: "In diesem Zeitraum gibt es nichts Neues bei deinen Freunden.",
      nextAction: "Wähle einen anderen Filter oder schau dir die Sammlung eines Freundes an.",
    };
  return {
    text: "Das ist neu bei deinen Freunden.",
    nextAction: "Schau dir die Sammlung eines Freundes an.",
  };
}

/**
 * "Neu bei Freunden" (US-SOZ-05, DM-SOZ-04): the events of all my friends, newest first, derived on every request from
 * what they share (`friendView`, so only through a confirmed friendship, never while a friend has "Everything private" on,
 * never a table of another module). Period default 30 days; filters by friend and "only new species". Events without a
 * known date come last: they cannot be placed in a period and are never guessed (P-08, P-10). No ranking and no
 * comparison between friends (FR-SOZ-11). "Potted" is the repot day of a shared specimen, "Swapped" a handed-over swap
 * I took part in with a current friend (a swap with a former friend stays in the swap history, US-SOZ-13).
 */
export async function friendFeed(
  deps: FeedDependencies,
  userId: string,
  query: FeedQuery,
): Promise<Feed> {
  const friends = (await deps.friends.friends(userId)).filter(
    (f) => query.friendId === undefined || f.id === query.friendId,
  );
  const views = await Promise.all(
    friends.map(async (f) => ({ f, view: await friendView(deps, userId, f.accountId) })),
  );
  const swaps = (await deps.swapped?.handedOver(userId)) ?? [];
  const dayOf = (instant: string) => localToday(new Date(instant), query.timeZone ?? "UTC");
  const all = views.flatMap(({ f, view }) => [
    ...deriveEvents({ id: f.id, name: f.name }, view.specimens),
    // A swap I took part in counts even if the friend shares nothing or is "Everything private": I am involved.
    ...swappedEvents(
      { id: f.id, name: f.name },
      swaps.filter((x) => x.otherId === f.accountId),
      dayOf,
    ),
  ]);
  const events = all
    .filter((e) => inPeriod(e, query))
    .filter((e) => !query.onlyNewSpecies || e.type === "new_species")
    .sort(order);
  const shared = views.reduce((n, v) => n + v.view.specimens.length, 0);
  return {
    events,
    asOf: deps.now().toISOString(),
    hint: hintFor(friends.length, events.length, shared),
  };
}
