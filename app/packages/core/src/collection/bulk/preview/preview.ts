// The import preview (US-BES-18, FR-BES-26): reads the file, answers every row and writes nothing. Operation
// `specimen.import_preview`; while the keeper switch "csv_import" is off it refuses with `onboarding.keeper_off` (P-12).
import {
  appError,
  defineOperation,
  described,
  failed,
  localToday,
  normalizeName,
  ok,
  shape,
  timeZoneField,
  type ErrorDetail,
  type Result,
} from "../../../kernel";
import type { LightLocationStore } from "../../../light";
import { markerAnswersField, type MarkerAnswer } from "../../shared/markers";
import type { SpecimenStore } from "../../shared/types";
import { parseImportCsv } from "../csv";
import { CSV_IMPORT_KEEPER_SWITCH, type ImportSpeciesSource } from "../types";
import { draftsOf, speciesIdOf, type Draft } from "./draft";
import { planFile, type MarkerRequest, type Plan } from "./plan";
import { displayName, type LocationMatch, type Reason, type SpeciesMatch } from "./rules";

export type RowState = "ready" | "flagged" | "already_there";

/** One row of the answer: what the row says, what it would write and why it is flagged (P-09, P-10). */
export interface PreviewRow {
  readonly line: number;
  readonly state: RowState;
  readonly species: {
    readonly name: string;
    /** The species the row names when exactly one matches exactly; `null` otherwise. */
    readonly id: string | null;
    readonly candidates: readonly { readonly id: string; readonly name: string }[];
    /** More species match than `candidates` lists (FR-BES-24). */
    readonly more: boolean;
  };
  readonly nickname: string | null;
  readonly marker: string | null;
  /** The specimen name it would get (DM-BES-03); `null` without a known species. */
  readonly specimenName: string | null;
  readonly location: LocationMatch | null;
  readonly catchDate: string | null;
  readonly notes: string | null;
  readonly reasons: readonly Reason[];
}

export interface ImportPreview {
  readonly rows: readonly PreviewRow[];
  readonly counts: {
    readonly ready: number;
    readonly flagged: number;
    readonly alreadyThere: number;
  };
  /** Locations the import would create on confirmation, once each, in their first spelling. */
  readonly newLocations: readonly string[];
  /** Existing specimens that need a marker before the file can be imported (US-BES-03). */
  readonly markers: readonly MarkerRequest[];
}

export interface PreviewDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly locations: Pick<LightLocationStore, "list">;
  readonly species: ImportSpeciesSource;
  /** Whether the keeper switched the import off (US-ONB-09, P-12). */
  readonly keeperOff: (userId: string) => Promise<boolean>;
  /** The clock for "today" (NFR-08). */
  readonly clock: () => Date;
}

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

// The file as text: its size and encoding are checked by the parser, so any string passes the schema.
const csvField = described(
  (value: unknown): string | ErrorDetail => (typeof value === "string" ? value : invalid("csv")),
  { type: "string" },
);

const schema = shape({
  csv: csvField,
  timeZone: timeZoneField("timeZone"),
  // Answers for existing specimens that need a marker (US-BES-03); the preview checks them, it writes nothing.
  markers: markerAnswersField,
});

const keeperOff = () =>
  appError("onboarding.keeper_off", { data: { id: CSV_IMPORT_KEEPER_SWITCH } });

const candidatesOf = (match: SpeciesMatch) =>
  match.kind === "candidates"
    ? {
        candidates: match.candidates.map((c) => ({ id: c.id, name: displayName(c) })),
        more: match.more,
      }
    : { candidates: [], more: false };

/** A row of the answer. An already existing specimen shows only that reason (it is skipped on confirmation). */
function rowOf(draft: Draft, reasons: readonly Reason[]): PreviewRow {
  const state: RowState = draft.already
    ? "already_there"
    : reasons.length === 0
      ? "ready"
      : "flagged";
  return {
    line: draft.row.line,
    state,
    species: { name: draft.row.species, id: speciesIdOf(draft), ...candidatesOf(draft.match) },
    nickname: draft.row.nickname,
    marker: draft.values.marker,
    specimenName: draft.name,
    location: draft.values.location,
    catchDate: draft.values.catchDate,
    notes: draft.values.notes,
    reasons: draft.already ? [{ code: "specimen.name_taken", field: "species" }] : reasons,
  };
}

/** The locations the rows would create, once per normalized name, in their first spelling. */
function newLocationsOf(drafts: readonly Draft[]): string[] {
  const first = new Map<string, string>();
  for (const d of drafts) {
    const location = d.values.location;
    if (location?.isNew && !d.already && !first.has(normalizeName(location.name)))
      first.set(normalizeName(location.name), location.name);
  }
  return [...first.values()];
}

function assemble(drafts: readonly Draft[], plan: Plan): ImportPreview {
  const rows = drafts.map((d) => rowOf(d, plan.reasons.get(d.row.line) ?? d.reasons));
  const count = (state: RowState) => rows.filter((r) => r.state === state).length;
  return {
    rows,
    counts: {
      ready: count("ready"),
      flagged: count("flagged"),
      alreadyThere: count("already_there"),
    },
    newLocations: newLocationsOf(drafts),
    markers: plan.markers,
  };
}

async function previewOf(
  deps: PreviewDependencies,
  userId: string,
  input: {
    readonly csv: string;
    readonly timeZone: string;
    readonly markers: readonly MarkerAnswer[];
  },
): Promise<Result<ImportPreview>> {
  if (await deps.keeperOff(userId)) return failed(keeperOff());
  const parsed = parseImportCsv(input.csv);
  if (!parsed.ok) return parsed;
  const today = localToday(deps.clock(), input.timeZone);
  const [specimens, locations] = await Promise.all([
    deps.specimens.list(userId),
    deps.locations.list(userId),
  ]);
  const drafts = await draftsOf({
    source: deps.species,
    userId,
    rows: parsed.value,
    today,
    locations,
    specimens,
  });
  const plan = planFile(drafts, specimens, input.markers);
  if (!plan.ok) return plan;
  return ok(assemble(drafts, plan.value));
}

/** The preview as an operation: the schema checks the input, `run` reads and answers. Nothing is written (P-03). */
export const specimenImportPreview = (deps: PreviewDependencies) =>
  defineOperation({
    name: "specimen.import_preview",
    schema,
    run: ({ userId }, input) => previewOf(deps, userId, input),
  });
