/** The "seen" state of the feed per account (US-SOZ-06); the adapter lives in `db`. */
export interface FeedSeenStore {
  /** The instant up to which the account has seen the feed (UTC, ISO 8601); `null` = never opened. */
  seenAt(userId: string): Promise<string | null>;
  /** Marks the feed as seen up to `upTo` (never later than now, never backwards); returns the state afterwards. */
  markSeen(userId: string, upTo: string): Promise<string>;
}

/** One line of the banner: how many new specimens of a species a friend shares (US-SOZ-06). */
export interface BannerItem {
  readonly friendId: string;
  readonly friendName: string | null;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly count: number;
}

/**
 * "Friends have N new plants" (US-SOZ-06). `firstVisit`: the feed was never opened, so nothing is new and no banner is
 * shown; the app then marks it as seen (silent creation). `asOf` is the instant the data was read; the screen shows it
 * as "Stand" when it can only show an older copy (FR-SOZ-03).
 */
export interface Banner {
  readonly firstVisit: boolean;
  readonly count: number;
  readonly items: readonly BannerItem[];
  /** UTC instant (ISO 8601). */
  readonly asOf: string;
}
