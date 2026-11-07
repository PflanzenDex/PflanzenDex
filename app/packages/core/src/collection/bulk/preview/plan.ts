// The file as a whole (US-BES-18): a row that repeats an earlier row of the same species and marker is flagged, the markers
// are judged per species over every row that would be written (US-BES-03), and the answers the keeper gave for existing
// specimens are checked against what the file needs. Pure.
import { appError, failed, ok, type Result } from "../../../kernel";
import type { MarkerAnswer } from "../../shared/markers";
import type { SpecimenRow } from "../../shared/types";
import { ACTIVE_FOR_MARKERS } from "../types";
import { siblingsOf, speciesIdOf, type Draft } from "./draft";
import { judgeMarkers, displayName, type ExistingMarkers, type Reason } from "./rules";

/** A species whose existing specimens need a marker before the file can be imported (US-BES-03). */
export interface MarkerRequest {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly missing: readonly { readonly id: string; readonly name: string }[];
}

export interface Plan {
  /** The reasons of every line: the drafts' own, plus what the file as a whole adds. */
  readonly reasons: ReadonlyMap<number, readonly Reason[]>;
  readonly markers: readonly MarkerRequest[];
}

/** The field a marker problem concerns: the nickname column. */
const MARKER_FIELD = "nickname";

/** A species of the rows that would be written, with those rows in file order. */
interface Group {
  readonly speciesId: string;
  readonly rows: readonly Draft[];
  readonly existing: ExistingMarkers;
}

/** The rows that would be written: no reason so far, and not already there. */
const writableOf = (drafts: readonly Draft[]): Draft[] =>
  drafts.filter((d) => d.reasons.length === 0 && !d.already);

/** Splits the writable rows: a later row with the same species and marker repeats an earlier one (case-insensitive). */
function duplicatesOf(writable: readonly Draft[]): { kept: Draft[]; repeated: number[] } {
  const seen = new Set<string>();
  const kept: Draft[] = [];
  const repeated: number[] = [];
  for (const draft of writable) {
    const key = `${speciesIdOf(draft) ?? ""}|${(draft.values.marker ?? "").toLowerCase()}`;
    if (seen.has(key)) repeated.push(draft.row.line);
    else {
      seen.add(key);
      kept.push(draft);
    }
  }
  return { kept, repeated };
}

/** The existing specimens of a species as the marker rules see them (US-BES-03). */
function existingOf(specimens: readonly SpecimenRow[], speciesId: string): ExistingMarkers {
  const { siblings, active } = siblingsOf(specimens, speciesId);
  return {
    active: active.length,
    taken: siblings.flatMap((z) => (z.marker === null ? [] : [z.marker])),
    unmarked: active.filter((z) => z.marker === null).map((z) => ({ id: z.id, name: z.name })),
  };
}

/** The kept rows grouped by species, in file order. */
function groupsOf(kept: readonly Draft[], specimens: readonly SpecimenRow[]): Group[] {
  const bySpecies = new Map<string, Draft[]>();
  for (const draft of kept) {
    const id = speciesIdOf(draft) ?? "";
    bySpecies.set(id, [...(bySpecies.get(id) ?? []), draft]);
  }
  return [...bySpecies].map(([speciesId, rows]) => ({
    speciesId,
    rows,
    existing: existingOf(specimens, speciesId),
  }));
}

/** A species needs answers when its active specimens reach three and some of them have no marker yet (US-BES-03). */
const needsAnswers = (group: Group): boolean =>
  group.existing.active + group.rows.length >= ACTIVE_FOR_MARKERS &&
  group.existing.unmarked.length > 0;

function requestOf(group: Group): MarkerRequest | null {
  if (!needsAnswers(group)) return null;
  const sample = group.rows[0]?.match;
  const speciesName = sample?.kind === "ready" ? displayName(sample.species) : "";
  return { speciesId: group.speciesId, speciesName, missing: group.existing.unmarked };
}

/** The answers may name only specimens that the file asks for; anything else is refused, not dropped (P-10). */
const answersValid = (
  answers: readonly MarkerAnswer[],
  requests: readonly MarkerRequest[],
): boolean => {
  const asked = new Set(requests.flatMap((r) => r.missing.map((m) => m.id)));
  return answers.every((a) => asked.has(a.specimenId));
};

/** The marker reasons of one species: every row that cannot be written as it stands, with its missing specimens. */
function markerReasons(group: Group, answers: readonly MarkerAnswer[]): [number, Reason][] {
  const own = answers.filter((a) => group.existing.unmarked.some((u) => u.id === a.specimenId));
  const incoming = group.rows.map((d) => ({ line: d.row.line, marker: d.values.marker }));
  return judgeMarkers(group.existing, incoming, own).map((flag): [number, Reason] => [
    flag.line,
    {
      code: flag.code,
      field: MARKER_FIELD,
      ...(flag.missing ? { data: { missing: flag.missing } } : {}),
    },
  ]);
}

/** Plans the file: the reasons per line and the markers the keeper still has to give. */
export function planFile(
  drafts: readonly Draft[],
  specimens: readonly SpecimenRow[],
  answers: readonly MarkerAnswer[],
): Result<Plan> {
  const { kept, repeated } = duplicatesOf(writableOf(drafts));
  const groups = groupsOf(kept, specimens);
  const requests = groups.flatMap((g) => {
    const request = requestOf(g);
    return request ? [request] : [];
  });
  if (!answersValid(answers, requests)) return failed(appError("specimen.not_found"));

  const reasons = new Map<number, Reason[]>(drafts.map((d) => [d.row.line, [...d.reasons]]));
  for (const line of repeated)
    reasons.get(line)?.push({ code: "import.duplicate_row", field: MARKER_FIELD });
  for (const group of groups)
    for (const [line, reason] of markerReasons(group, answers)) reasons.get(line)?.push(reason);
  // The keeper is asked only for the specimens still without an answer; the answers already given stay valid (above).
  const open = requests
    .map((r) => ({
      ...r,
      missing: r.missing.filter((m) => !answers.some((a) => a.specimenId === m.id)),
    }))
    .filter((r) => r.missing.length > 0);
  return ok({ reasons, markers: open });
}
