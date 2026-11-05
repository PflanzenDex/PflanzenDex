// Test double of the card reads of the API (US-BES-06, FR-BES-23, NFR-12): one page of cards in the order of the API
// (name, then ID) with its cursor, the summary, the treatment list and one card. Location IDs are the location names
// here, so the filter `location=` of a group is its name. A request this double does not know gives `null`.
import type { SpecimenCard } from "@pflanzendex/core";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The sort key of the API: the lower-case name, then the ID (the keyset of the page). */
const keyOf = (c: Pick<SpecimenCard, "name" | "id">) => `${c.name.toLowerCase()}\u0000${c.id}`;

/** The cursor as the API hands it out: the URI-encoded JSON of the name and the ID. */
const cursorOf = (c: Pick<SpecimenCard, "name" | "id">) =>
  encodeURIComponent(JSON.stringify({ name: c.name, id: c.id }));

/** The key of a cursor the client sent back (`after=`). */
function keyOfCursor(after: string): string {
  const { name, id } = JSON.parse(decodeURIComponent(after)) as { name: string; id: string };
  return keyOf({ name, id });
}

/** One page of cards: the filter, the order, `limit` (default 100) and the cursor of the next page. */
function pageOf(params: URLSearchParams, cards: readonly SpecimenCard[]) {
  const location = params.get("location");
  const species = params.get("species");
  const after = params.get("after");
  const limit = Number(params.get("limit") ?? 100);
  const filtered = cards
    .filter(
      (c) =>
        location === null || (location === "none" ? c.location === null : c.location === location),
    )
    .filter((c) => species === null || c.speciesId === species)
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const afterKey = after === null ? null : keyOfCursor(after);
  const following = filtered.filter((c) => afterKey === null || keyOf(c) > afterKey);
  const page = following.slice(0, limit);
  const last = page.at(-1);
  const next = following.length > limit && last ? cursorOf(last) : null;
  return { cards: page, total: filtered.length, next };
}

/** The summary over all given cards: the groups by location name, the unplaced count and the last location (P-08). */
function summaryOf(cards: readonly SpecimenCard[]) {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (c.location !== null) counts.set(c.location, (counts.get(c.location) ?? 0) + 1);
  }
  const named = [...cards]
    .filter((c) => c.location !== null)
    .sort((a, b) => (b.caughtAt ?? "").localeCompare(a.caughtAt ?? ""));
  return {
    total: cards.length,
    unplaced: cards.filter((c) => c.location === null).length,
    groups: [...counts].map(([name, count]) => ({ locationId: name, location: name, count })),
    anyMeasured: cards.some((c) => c.lastMeasurement !== null),
    lastLocation: named[0]?.location ?? null,
  };
}

/** The answer of the card reads for `url`, or `null` when the request is not a card read of this double. */
export function answerCardRead(url: URL, cards: readonly SpecimenCard[]): Response | null {
  const path = url.pathname;
  if (path === "/specimens/cards") return json(200, pageOf(url.searchParams, cards));
  if (path === "/specimens/cards/summary") return json(200, summaryOf(cards));
  if (path === "/specimens/treatable") {
    return json(200, {
      specimens: cards.map(({ id, name, location }) => ({ id, name, location })),
    });
  }
  const one = /^\/specimens\/([^/]+)\/card$/.exec(path);
  if (one) {
    const card = cards.find((c) => c.id === one[1]);
    return card
      ? json(200, card)
      : json(404, { error: { code: "specimen.not_found", text: "Diese Pflanze gibt es nicht." } });
  }
  return null;
}

/** An account without plants: the first page and the summary of the card reads (FR-BES-23). */
export const NO_CARDS_PAGE = { cards: [], total: 0, next: null };
export const NO_CARDS_SUMMARY = {
  total: 0,
  unplaced: 0,
  groups: [],
  lastLocation: null,
  anyMeasured: false,
};
