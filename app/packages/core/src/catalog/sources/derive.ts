import { dig, text } from "./types";
import type { FieldValue, FillableField, FillSource, SourceSnapshot } from "./types";

const STORY_MAX = 240;
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-ZÄÖÜ"„])/;

/** At most 2 sentences and 240 characters; if even the first is longer there is no text rather than a cut one (P-08). */
function shortStory(extract: string): string | null {
  let taken = extract.replace(/\s+/g, " ").trim().split(SENTENCE_END).slice(0, 2);
  while (taken.length > 0 && taken.join(" ").length > STORY_MAX) taken = taken.slice(0, -1);
  return taken.length > 0 ? taken.join(" ") : null;
}

interface Candidate {
  readonly source: FillSource;
  readonly value: string;
}

type By = Partial<Record<FillSource, SourceSnapshot>>;
const pick = (source: FillSource, value: string | null): Candidate[] =>
  value === null ? [] : [{ source, value }];

function family(by: By): Candidate[] {
  const gbif = by.gbif?.raw;
  const exact = dig(gbif, "matchType") === "EXACT" && dig(gbif, "rank") === "SPECIES";
  return pick("gbif", exact ? text(dig(gbif, "family")) : null);
}

function germanName(by: By, latinName: string): Candidate[] {
  const wd = by.wikidata;
  const label = text(dig(wd?.raw, "entities", wd?.sourceId ?? "", "labels", "de", "value"));
  const title = text(dig(by.wikipedia?.raw, "title"));
  const page = dig(by.wikipedia?.raw, "content_urls", "desktop", "page");
  const german = typeof page === "string" && page.startsWith("https://de.") && title !== latinName;
  return [...pick("wikidata", label), ...pick("wikipedia", german ? title : null)];
}

function story(by: By): Candidate[] {
  const extract = text(dig(by.wikipedia?.raw, "extract"));
  return pick("wikipedia", extract === null ? null : shortStory(extract));
}

/** Candidate values of one field per source, in the rank order of FR-BES-17 (first = preferred). */
function candidates(field: FillableField, by: By, latinName: string): Candidate[] {
  if (field === "familyLatin") return family(by);
  if (field === "germanName") return germanName(by, latinName);
  return story(by);
}

/**
 * Converts snapshots into catalog values for the still-empty fields only (nothing is overwritten, FR-BES-19). The
 * source ranked first wins, never a mean; differing values mark the field disputed (FR-BES-17). A field no source
 * fills is absent, so it stays "unknown" (P-08). Repeatable from the snapshots without a new request (FR-BES-15).
 */
export function deriveFields(
  snapshots: readonly SourceSnapshot[],
  latinName: string,
  empty: readonly FillableField[],
): FieldValue[] {
  const by: By = {};
  for (const s of snapshots) by[s.source] = s;
  const out: FieldValue[] = [];
  for (const field of empty) {
    const [first, ...rest] = candidates(field, by, latinName);
    const snap = first === undefined ? undefined : by[first.source];
    if (first === undefined || snap === undefined) continue;
    out.push({
      field,
      value: first.value,
      origin: "source",
      source: first.source,
      link: snap.link,
      license: snap.license,
      retrievedAt: snap.retrievedAt,
      disputed: rest.some((c) => c.value !== first.value),
    });
  }
  return out;
}
