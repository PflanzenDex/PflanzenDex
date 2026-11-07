// The import preview (US-BES-18, FR-BES-26): reads the file, answers every row and writes nothing. Operation
// `specimen.import_preview`; while the keeper switch "csv_import" is off it refuses with `onboarding.keeper_off` (P-12).
import {
  appError,
  defineOperation,
  described,
  failed,
  localToday,
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
import { assemble, type ImportPreview } from "./build/answer";
import { draftsOf } from "./build/draft";
import { chosenMatches, fixRows, overridesField, type ImportOverride } from "./overrides";
import { planFile } from "./build/plan";

export type { ImportPreview, PreviewRow, RowState } from "./build/answer";

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
  // The keeper's fixes to flagged rows (US-BES-18): a chosen species, a marker or a skip, keyed by line.
  overrides: overridesField,
});

const keeperOff = () =>
  appError("onboarding.keeper_off", { data: { id: CSV_IMPORT_KEEPER_SWITCH } });

async function previewOf(
  deps: PreviewDependencies,
  userId: string,
  input: {
    readonly csv: string;
    readonly timeZone: string;
    readonly markers: readonly MarkerAnswer[];
    readonly overrides: readonly ImportOverride[];
  },
): Promise<Result<ImportPreview>> {
  if (await deps.keeperOff(userId)) return failed(keeperOff());
  const parsed = parseImportCsv(input.csv);
  if (!parsed.ok) return parsed;
  const fixed = fixRows(parsed.value, input.overrides);
  if (!fixed.ok) return fixed;
  const today = localToday(deps.clock(), input.timeZone);
  const [specimens, locations, chosen] = await Promise.all([
    deps.specimens.list(userId),
    deps.locations.list(userId),
    chosenMatches(deps.species, userId, fixed.value.chosen),
  ]);
  const drafts = await draftsOf({
    source: deps.species,
    userId,
    rows: fixed.value.rows,
    today,
    locations,
    specimens,
    chosen,
  });
  // A skipped row leaves the plan completely: the file is judged without it (US-BES-18).
  const written = drafts.filter((d) => !fixed.value.skipped.has(d.row.line));
  const plan = planFile(written, specimens, input.markers);
  if (!plan.ok) return plan;
  return ok(assemble(drafts, fixed.value.skipped, plan.value));
}

/** The preview as an operation: the schema checks the input, `run` reads and answers. Nothing is written (P-03). */
export const specimenImportPreview = (deps: PreviewDependencies) =>
  defineOperation({
    name: "specimen.import_preview",
    schema,
    run: ({ userId }, input) => previewOf(deps, userId, input),
  });
