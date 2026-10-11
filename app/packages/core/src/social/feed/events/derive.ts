import type { SharedSpecimen } from "../../sharing";
import type { FeedEvent, FeedType } from "../types";

/** Whole days from `from` to `to` (calendar dates `YYYY-MM-DD`); calendar arithmetic, so daylight saving shifts nothing. */
export function daysBetween(from: string, to: string): number {
  const day = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, dd) / 86_400_000;
  };
  return day(to) - day(from);
}

type Friend = { readonly id: string; readonly name: string | null };

/** The species a specimen counts under: the Latin name, `null` when the species is unknown to friends (a private proposal). */
const speciesKey = (s: SharedSpecimen) => s.speciesLatin;

/** The earliest dated day per species among the shared specimens (species unknown to friends and undated ones are skipped). */
function firstDays(specimens: readonly SharedSpecimen[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const s of specimens) {
    const key = speciesKey(s);
    if (key === null || s.caughtAt === null) continue;
    const seen = first.get(key);
    if (seen === undefined || s.caughtAt < seen) first.set(key, s.caughtAt);
  }
  return first;
}

/** Precedence: a cutting is "new cutting", the first specimens of a species "new species", every other one "new specimen". */
function typeOf(s: SharedSpecimen, first: ReadonlyMap<string, string>): FeedType {
  if (s.isCutting) return "new_cutting";
  const key = speciesKey(s);
  return key !== null && s.caughtAt !== null && first.get(key) === s.caughtAt
    ? "new_species"
    : "new_specimen";
}

/**
 * The events one friend's shared specimens create (US-SOZ-05). The date is `Caught_At`, or unknown (P-08); sharing an
 * old specimen therefore creates no "new today" event, it carries its real date. A species counts as new on the
 * earliest dated day among the shared specimens of that species (assumption: judged by what is shared, the rest of the
 * friend's collection is private). Specimens of the same species, day and type are summarized.
 */
export function deriveEvents(friend: Friend, specimens: readonly SharedSpecimen[]): FeedEvent[] {
  const first = firstDays(specimens);
  const groups = new Map<string, FeedEvent>();
  const add = (s: SharedSpecimen, type: FeedType, date: string | null) => {
    const id = JSON.stringify([speciesKey(s) ?? s.id, date, type]);
    groups.set(id, {
      friendId: friend.id,
      friendName: friend.name,
      type,
      speciesLatin: s.speciesLatin,
      speciesGerman: s.speciesGerman,
      date,
      count: (groups.get(id)?.count ?? 0) + 1,
    });
  };
  for (const s of specimens) {
    add(s, typeOf(s, first), s.caughtAt);
    // "Potted" only with a known repot day: a shared plant that was never repotted, or whose day is unknown, adds none (P-08).
    if (s.repottedAt) add(s, "potted", s.repottedAt);
  }
  return [...groups.values()];
}

/** A handed-over swap the viewer took part in (US-SOZ-11), as the port `SwappedSource` gives it. */
export interface SwappedFact {
  readonly otherId: string;
  /** The handover instant (ISO 8601, UTC). */
  readonly date: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly direction: "given" | "received";
}

/** "Swapped" events of the viewer with one current friend, one per species and local day (summarized). */
export function swappedEvents(
  friend: Friend,
  facts: readonly SwappedFact[],
  dayOf: (instant: string) => string,
): FeedEvent[] {
  const groups = new Map<string, FeedEvent>();
  for (const f of facts) {
    const date = dayOf(f.date);
    const id = JSON.stringify([f.speciesLatin ?? f.speciesGerman, date]);
    groups.set(id, {
      friendId: friend.id,
      friendName: friend.name,
      type: "swapped",
      speciesLatin: f.speciesLatin,
      speciesGerman: f.speciesGerman,
      date,
      count: (groups.get(id)?.count ?? 0) + 1,
    });
  }
  return [...groups.values()];
}
