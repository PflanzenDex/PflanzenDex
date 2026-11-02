// The content of each draft type as JSON Schema for `propose_draft` (US-KI-07): fields, types, enums and limits come from
// the schema of the operation that validates the draft (KI-R1, P-03), so the tool lists every field, the optional ones
// included, and cannot drift from the check. Only the descriptions are written here, for the model (English; field names
// are code identifiers). Describing changes no right and no check: the operation still decides.
import {
  discoverDecideSchema,
  jsonSchemaOf,
  measurementAssessSchema,
  speciesSchema,
  wishCreateSchema,
  type JsonSchema,
} from "@pflanzendex/core";

interface DraftContent {
  /** The check of the operation that validates the content and runs again on adoption. */
  readonly schema: object;
  readonly description: string;
  /** A description per field of the check; a field without one fails the test (US-KI-07). */
  readonly fields: Readonly<Record<string, string>>;
  /** Fields the server sets itself; the client never sends them. */
  readonly serverSet?: readonly string[];
  /** Fields the draft type requires on top of the check (species: the source, US-KI-03). */
  readonly alsoRequired?: readonly string[];
}

const TEXT =
  "Free text shown to the keeper in German; null or omitted when unknown (never guess, P-08).";

const SPECIES: DraftContent = {
  schema: speciesSchema,
  description:
    "Species profile (US-KI-03). Every statement needs a source. Unknown values stay null; dormancyFrom and " +
    "dormancyUntil count only as a pair.",
  fields: {
    latinName:
      "Latin name genus + epithet, e.g. 'Ficus benjamina'; a cultivar in quotes is allowed ('Ficus elastica " +
      "'Robusta''), no hybrid sign (x, ×, +) and no addition (var., subsp., f., cv.).",
    germanName: "Common name in German, as used in German-speaking countries.",
    englishName: "English common name, e.g. 'weeping fig'.",
    synonyms: "Other Latin names of the species, e.g. ['Ficus nitida'].",
    familyGerman: "Plant family, its German name.",
    familyLatin: "Plant family, Latin name, e.g. 'Moraceae'.",
    difficulty: "Care difficulty: 1 easy, 2 medium, 3 demanding.",
    standardLevel:
      "Default light zone (light level) for adult plants: 2 bright/near the lamp, 3 medium, 4 dim. Zone 1 is " +
      "cutting light and not allowed here.",
    lightDemandLux: "Light demand in lux (integer), e.g. 10000.",
    softLeaf:
      "True for soft, thin leaves that burn easily under strong light; omitted means false.",
    dormancyFrom:
      "Start of the dormancy (rest phase) as MM-DD without a year, e.g. '11-01'. Needs dormancyUntil.",
    dormancyUntil:
      "End of the dormancy (rest phase) as MM-DD without a year, e.g. '02-28'. Needs dormancyFrom.",
    locationHint: `Where the plant should stand. ${TEXT}`,
    growthMeasure:
      "How growth is measured: height, rosette_diameter (rosette plants) or shoot_length (trailing plants).",
    etiolationSigns:
      "What etiolation (stretching from too little light) looks like for this species, in German.",
    wateringHint: `How to water. ${TEXT}`,
    substrate: `Suitable substrate. ${TEXT}`,
    pruning: `How and when to prune. ${TEXT}`,
    growthHacks: `Tips that help growth. ${TEXT}`,
    successCriteria: "What healthy growth looks like (etiolated growth never counts), in German.",
    botanicalStory: `Short botanical background or origin. ${TEXT}`,
    source: "Where the profile comes from (URL or citation); required for a draft.",
  },
  alsoRequired: ["source"],
};

const PHOTO_ASSESSMENT: DraftContent = {
  schema: measurementAssessSchema,
  description:
    "Quality and note for the photo of a measurement (US-KI-04, get_measurement_photo). Judge only what is visible.",
  fields: {
    measurementId: "Id of the measurement whose photo you assessed (UUID).",
    quality: "healthy, or etiolated (stretched/thin from too little light).",
    note: `Short note on what is visible. ${TEXT}`,
    aiSuggestion: "Set by the server.",
  },
  serverSet: ["aiSuggestion"],
};

const WISH: DraftContent = {
  schema: wishCreateSchema,
  description:
    "Wish candidate for the wishlist (US-KI-05). Only the name is required; an image needs its source and the other " +
    "way round.",
  fields: {
    name: "Latin species name, e.g. 'Hoya carnosa'.",
    german: "Common name in German.",
    targetZoneId: "Id (UUID) of one of the keeper's light zones the plant is meant for.",
    difficulty: "Care difficulty: 1 easy, 2 medium, 3 demanding.",
    reasoning: `Why this plant fits. ${TEXT}`,
    imageUrl: "https URL of an image, e.g. a Wikimedia Commons file; needs imageSource.",
    imageSource: "Source page of the image (check it with check_image_source); needs imageUrl.",
    license: "License of the image, e.g. 'CC BY-SA 4.0'.",
  },
};

const DISCOVER_DECISION: DraftContent = {
  schema: discoverDecideSchema,
  description:
    "The keeper's answer to a Discover suggestion (US-ENT-08); usually sent with decide_discover_suggestion.",
  fields: {
    species: "Species name exactly as in the suggestion.",
    decision: "yes (onto the wishlist), no (discard) or later (nothing is written).",
    timeZone: "IANA time zone of the keeper, e.g. Europe/Berlin.",
  },
};

/** The draft types in the order of `list_draft_types`. */
export const DRAFT_CONTENTS: Readonly<Record<string, DraftContent>> = {
  species: SPECIES,
  photo_assessment: PHOTO_ASSESSMENT,
  discover_decision: DISCOVER_DECISION,
  wish: WISH,
};

const asObject = (json: JsonSchema | null) =>
  (json ?? {}) as { properties?: Record<string, JsonSchema>; required?: string[] };

/** The JSON Schema of the content of one draft type: the check's fields, minus the server's, with descriptions. */
export function draftContentSchema(type: string, c: DraftContent): JsonSchema {
  const derived = asObject(jsonSchemaOf(c.schema));
  const hidden = new Set(c.serverSet ?? []);
  const properties = Object.fromEntries(
    Object.entries(derived.properties ?? {})
      .filter(([k]) => !hidden.has(k))
      .map(([k, json]) => [k, { ...json, ...(c.fields[k] ? { description: c.fields[k] } : {}) }]),
  );
  const required = [...new Set([...(derived.required ?? []), ...(c.alsoRequired ?? [])])].filter(
    (k) => !hidden.has(k),
  );
  return {
    title: type,
    description: `Content when type is '${type}'. ${c.description}`,
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** The content of `propose_draft`: one branch per draft type, chosen by the argument `type`. */
export const DRAFT_CONTENT_SCHEMA: JsonSchema = {
  type: "object",
  description:
    "The fields of the target form for this draft type; the branch whose title equals `type` applies. " +
    "Optional fields may be omitted or null when unknown.",
  anyOf: Object.entries(DRAFT_CONTENTS).map(([type, c]) => draftContentSchema(type, c)),
};
