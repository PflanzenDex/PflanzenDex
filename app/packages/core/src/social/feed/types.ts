/** The kinds of event a friend's shared specimen can create (US-SOZ-05). "Potted" and "Swapped" need history that does not exist yet. */
export const FEED_TYPES = ["new_species", "new_cutting", "new_specimen"] as const;
export type FeedType = (typeof FEED_TYPES)[number];

/** Default period in days (US-SOZ-05; the spec's starting value). */
export const FEED_DAYS = 30;

/**
 * One entry of "Neu bei Freunden" (DM-SOZ-04): derived from the shared specimens of a friend on every request, never
 * stored (P-01). Events of the same friend, species, day and type are summarized (`count` specimens).
 */
export interface FeedEvent {
  /** The friendship id (the same id the friend list uses); never the account id of the friend (P-05). */
  readonly friendId: string;
  readonly friendName: string | null;
  readonly type: FeedType;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  /** Local calendar date `YYYY-MM-DD` of `Caught_At`; `null` = unknown, never guessed (P-08). */
  readonly date: string | null;
  readonly count: number;
}

export interface FeedQuery {
  /** Today's calendar date in the viewer's time zone (NFR-08); the clock stays outside `core`. */
  readonly today: string;
  /** Period in days, counted back from `today`; `FEED_DAYS` when left out. */
  readonly days?: number;
  /** Only the events of this friend (the friendship id). */
  readonly friendId?: string;
  /** Only the type "new species". */
  readonly onlyNewSpecies?: boolean;
}

export interface Feed {
  readonly events: readonly FeedEvent[];
  /** UTC instant (ISO 8601) the data was read; the screen shows it as "Stand" when it can only show an older copy (FR-SOZ-03). */
  readonly asOf: string;
  /** What to do next (P-09). */
  readonly hint: { readonly text: string; readonly nextAction: string };
}
