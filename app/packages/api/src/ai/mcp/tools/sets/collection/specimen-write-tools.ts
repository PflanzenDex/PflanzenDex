// Write tools of the specimens (US-KI-14): each one runs the operation of the app's form through its route (KI-R10). The
// input schema comes from the operation's check, with references by id or name in place of the id fields (FR-KI-15,
// FR-KI-17); only the descriptions are written here, a field without one fails at start.
import {
  specimenCorrectCatchDateSchema,
  specimenCreateSchema,
  specimenMarkSchema,
  specimenRepotWithPotSchema,
  specimenRestoreSchema,
  specimenSetLightZoneSchema,
  specimenSetLocationSchema,
  writeInputSchema,
  type JsonSchema,
  type SpecimenWrite,
} from "@pflanzendex/core";
import { SPECIMEN_WRITE_PATHS } from "../../../../drafts/client-write-routes";
import { IDEMPOTENCY, seg, type Json, type McpTool } from "../../schema";
import { REF, TZ } from "./collection-tools";

const SPECIMEN = REF("specimen (species name with marker)", "Aloe vera – blau");
const LOCATION = REF("location", "Regal 2");
const ZONE = REF("light zone; its number works too", "3");
const RIGHTS =
  " With the right 'write' it is saved at once and the answer shows the specimen before and after; with 'drafts' " +
  "only, it becomes a draft the keeper adopts in the app and the answer names the right to request (stepUp).";

function inputFor(
  write: SpecimenWrite,
  check: object,
  descriptions: Readonly<Record<string, string>>,
): Json {
  const json = writeInputSchema(write, check) as {
    properties: Record<string, JsonSchema>;
    required: string[];
  };
  const properties = Object.fromEntries(
    Object.entries(json.properties).map(([k, schema]) => {
      const description = descriptions[k];
      if (!description) throw new Error(`No description for the argument ${k} of ${write}`);
      return [k, { ...schema, description }];
    }),
  );
  return {
    ...json,
    properties: { ...properties, idempotencyKey: IDEMPOTENCY },
    required: [...json.required, "idempotencyKey"],
  };
}

interface WriteToolSpec {
  readonly title: string;
  readonly description: string;
  /** The check of the app operation the tool runs (FR-KI-17). */
  readonly check: object;
  readonly fields: Readonly<Record<string, string>>;
}

function writeTool(write: SpecimenWrite, spec: WriteToolSpec): McpTool {
  const { title, description, check, fields: descriptions } = spec;
  return {
    name: write,
    title,
    description: description + RIGHTS,
    operation: write,
    inputSchema: inputFor(write, check, descriptions),
    readOnly: false,
    request: ({ idempotencyKey, specimen, ...body }) => ({
      method: "POST",
      path: SPECIMEN_WRITE_PATHS[write].replace(":specimen", seg(specimen)),
      body,
      ...(typeof idempotencyKey === "string" ? { idempotencyKey } : {}),
    }),
  };
}

export const SPECIMEN_WRITE_TOOLS: readonly McpTool[] = [
  writeTool("create_specimen", {
    title: "Add a specimen or a cutting",
    description:
      "Creates a specimen of a species like the form of the app. From the third specimen of a species on, every " +
      "specimen needs a marker; the refusal specimen.markers_missing names the ones without, answer them in markers.",
    check: specimenCreateSchema,
    fields: {
      species: REF("species", "Aloe vera"),
      timeZone: TZ,
      marker: "Marker that tells specimens of one species apart, e.g. 'blau'.",
      markers:
        "Markers for existing specimens of the species that have none: [{specimenId, marker}].",
      location: LOCATION,
      lightZone: ZONE,
      status: "plant (default) or cutting.",
      catchDate: "Day the keeper got it, YYYY-MM-DD, not after today; omitted means today.",
    },
  }),
  writeTool("set_specimen_marker", {
    title: "Give a marker",
    description: "Gives a specimen a marker or changes it; unique per species.",
    check: specimenMarkSchema,
    fields: { specimen: SPECIMEN, marker: "The new marker, e.g. 'blau'." },
  }),
  writeTool("correct_catch_date", {
    title: "Correct the catch date",
    description: "Corrects the day the keeper got the specimen (same rules as on creation).",
    check: specimenCorrectCatchDateSchema,
    fields: {
      specimen: SPECIMEN,
      timeZone: TZ,
      catchDate: "The day, YYYY-MM-DD, not after today.",
    },
  }),
  writeTool("set_specimen_location", {
    title: "Set the location",
    description: "Moves a specimen to one of the keeper's locations.",
    check: specimenSetLocationSchema,
    fields: { specimen: SPECIMEN, location: LOCATION },
  }),
  writeTool("set_specimen_light_zone", {
    title: "Set the own light zone",
    description:
      "Sets the specimen's own light zone, or clears it with null so the zone of its location applies again.",
    check: specimenSetLightZoneSchema,
    fields: { specimen: SPECIMEN, lightZone: `${ZONE} null clears it.` },
  }),
  writeTool("repot_specimen", {
    title: "Pot a cutting or repot",
    description:
      "Pots a cutting (it becomes a plant) or records a repot. Without potId the plant is taken out of the pot it " +
      "sits in, as in the app; name the pot to keep or change it.",
    check: specimenRepotWithPotSchema,
    fields: {
      specimen: SPECIMEN,
      timeZone: TZ,
      date: "Day of the repot, YYYY-MM-DD, not after today; omitted means today.",
      potId: "Id of the pot (list_equipment) the plant sits in after the repot.",
    },
  }),
  writeTool("restore_specimen", {
    title: "Restore from the archive",
    description: "Brings an archived specimen back into the collection.",
    check: specimenRestoreSchema,
    fields: { specimen: SPECIMEN },
  }),
];
