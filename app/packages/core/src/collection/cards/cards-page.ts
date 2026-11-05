// One page of the specimen cards (US-BES-06, FR-BES-23) and the reads over all plants that the list needs: the summary,
// one card by ID and the cursor. A page is a keyset page over the database order, so a plant that is added or archived
// between two pages neither repeats nor skips another one. Each card comes from `cardsOf`, the mapping of the AI read
// too, so the two cannot disagree (P-01: the code computes, nothing is stored).
import { isId } from "../../kernel";
import { cardsOf, NO_MEASURED, type CardsDependencies } from "./cards";
import type {
  CardCursor,
  CardPage,
  CardPageQuery,
  MeasuredSource,
  SpecimenCard,
  SpecimenPageSource,
  SpecimenSummary,
  TreatableSpecimen,
} from "./cards-types";
import { isActive } from "../shared/types";

/** Cards per page (starting value, assumption): 100 cards are about 46 KB at the measured 459 B per card (FR-BES-23). */
export const CARD_PAGE_SIZE = 100;
/** The largest page a client may ask for (starting value, assumption). */
export const CARD_PAGE_MAX = 200;

export interface CardPageDependencies extends CardsDependencies {
  readonly pages: SpecimenPageSource;
  /** The measured plants (`care`); without it no plant counts as measured (P-08). */
  readonly measured?: MeasuredSource | undefined;
}

// The cursor is opaque text for clients: the URI-encoded JSON of the name and the ID. Only those two fields are read back,
// and the ID must be a UUID; anything else is no cursor of this list.
export function encodeCardCursor(cursor: CardCursor): string {
  return encodeURIComponent(JSON.stringify({ name: cursor.name, id: cursor.id }));
}

/** The cursor of a text made by `encodeCardCursor`; any other text is `null`. */
export function decodeCardCursor(text: string): CardCursor | null {
  try {
    const value = JSON.parse(decodeURIComponent(text)) as { name?: unknown; id?: unknown } | null;
    const name = value?.name;
    const id = value?.id;
    return typeof name === "string" && typeof id === "string" && isId(id)
      ? { name, id: id.toLowerCase() }
      : null;
  } catch {
    // Not a URI-encoded JSON: the caller answers `input.invalid` (the refusal is reported, nothing is hidden).
    return null;
  }
}

/** The query parameters of the card list as the URL carries them; an absent one is `undefined`. */
export interface CardPageParams {
  readonly limit?: string | undefined;
  readonly after?: string | undefined;
  readonly location?: string | undefined;
  readonly species?: string | undefined;
}

export type CardPageField = "limit" | "after" | "location" | "species";

export type CardPageParse =
  | { readonly ok: true; readonly query: CardPageQuery }
  | { readonly ok: false; readonly field: CardPageField };

const LIMIT_TEXT = /^\d{1,4}$/;
const idOrNull = (text: string): string | null => (isId(text) ? text.toLowerCase() : null);
const locationOrNull = (text: string): string | null => (text === "none" ? text : idOrNull(text));

/** The limit text: an integer from 1 to `CARD_PAGE_MAX`, `null` when refused. */
function limitOrNull(text: string): number | null {
  const n = LIMIT_TEXT.test(text) ? Number(text) : 0;
  return n >= 1 && n <= CARD_PAGE_MAX ? n : null;
}

/** Checks the card list's parameters (FR-BES-23). A present parameter that is refused names its field. */
export function parseCardPageQuery(params: CardPageParams): CardPageParse {
  const limit = params.limit === undefined ? CARD_PAGE_SIZE : limitOrNull(params.limit);
  const after = params.after === undefined ? null : decodeCardCursor(params.after);
  const location = params.location === undefined ? null : locationOrNull(params.location);
  const species = params.species === undefined ? null : idOrNull(params.species);
  const checks: [CardPageField, string | undefined, unknown][] = [
    ["limit", params.limit, limit],
    ["after", params.after, after],
    ["location", params.location, location],
    ["species", params.species, species],
  ];
  const refused = checks.find(([, text, value]) => text !== undefined && value === null);
  if (refused) return { ok: false, field: refused[0] };
  return { ok: true, query: { limit: limit ?? CARD_PAGE_SIZE, after, location, species } };
}

/**
 * One page of the cards (US-BES-06, FR-BES-23): the cards of the page, the total of the whole filter and the cursor of the
 * next page, `null` on the last page. The ports of the cards are asked for the specimens of this page only (NFR-12).
 */
export async function specimenCardPage(
  deps: CardPageDependencies,
  userId: string,
  today: string,
  query: CardPageQuery,
): Promise<CardPage> {
  const page = await deps.pages.page(userId, query);
  const cards = await cardsOf(deps, userId, today, page.rows);
  const last = page.rows.at(-1);
  const next = page.more && last ? encodeCardCursor({ name: last.name, id: last.id }) : null;
  return { cards, total: page.total, next };
}

/**
 * One active card by ID (US-BES-06): the card the list shows. Archived, unknown and foreign IDs give `null` alike, so
 * another account's ID is answered like a missing one (P-04).
 */
export async function specimenCardOf(
  deps: CardPageDependencies,
  userId: string,
  today: string,
  id: string,
): Promise<SpecimenCard | null> {
  if (!isId(id)) return null;
  const row = await deps.specimens.find(userId, id.toLowerCase());
  if (!row || !isActive(row)) return null;
  const [card] = await cardsOf(deps, userId, today, [row]);
  return card ?? null;
}

/** Whether an active plant is measured: `care` names the measured plants, the database says which of them are active. */
async function anyActiveMeasured(deps: CardPageDependencies, userId: string): Promise<boolean> {
  const ids = await (deps.measured ?? NO_MEASURED).measuredSpecimenIds(userId);
  return ids.length > 0 && (await deps.pages.anyActive(userId, ids));
}

/**
 * The summary of all active plants (US-BES-06), not of one page: the counts come from the database, the names of the
 * places from the places of the account (`locations`), and whether any plant is measured as described above. Groups are
 * sorted by place name.
 */
export async function specimenSummary(
  deps: CardPageDependencies,
  userId: string,
): Promise<SpecimenSummary> {
  const [counts, locations, anyMeasured] = await Promise.all([
    deps.pages.summary(userId),
    deps.locations.list(userId),
    anyActiveMeasured(deps, userId),
  ]);
  const name = new Map(locations.map((l) => [l.id, l.name] as const));
  const groups = counts.groups
    .map((g) => ({
      locationId: g.locationId,
      location: name.get(g.locationId) ?? null,
      count: g.count,
    }))
    .sort(
      (a, b) =>
        (a.location ?? "").localeCompare(b.location ?? "") ||
        a.locationId.localeCompare(b.locationId),
    );
  const lastLocation =
    counts.lastLocationId === null ? null : (name.get(counts.lastLocationId) ?? null);
  return { total: counts.total, unplaced: counts.unplaced, groups, lastLocation, anyMeasured };
}

/** The slim list of the treatment form (US-BEH-01): every active plant with its place name, `null` when unknown (P-08). */
export async function specimenTreatable(
  deps: CardPageDependencies,
  userId: string,
): Promise<readonly TreatableSpecimen[]> {
  const [rows, locations] = await Promise.all([
    deps.pages.treatable(userId),
    deps.locations.list(userId),
  ]);
  const name = new Map(locations.map((l) => [l.id, l.name] as const));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    location: r.locationId === null ? null : (name.get(r.locationId) ?? null),
  }));
}
