// Tools over the catalog and the collection (US-KI-11): search and read species, specimens, locations, light zones and
// measurements, by id or by readable name. The input schemas come from the checks of the read operations (FR-KI-17), only
// the descriptions are written here; a field without a description fails the test.
import {
  getSpeciesSchema,
  getSpecimenSchema,
  jsonSchemaOf,
  listMeasurementsSchema,
  listPlacesSchema,
  listSpecimensSchema,
  searchSpeciesSchema,
  PAGE_SIZE,
  type JsonSchema,
} from "@pflanzendex/core";
import { query, seg, type Json, type McpTool } from "../schema";

export const PAGE = {
  offset:
    "Start of the page (0 = first); take nextOffset of the previous answer. Lists say total and nextOffset.",
  limit: `Items per page, default ${PAGE_SIZE.default}, at most ${PAGE_SIZE.max}.`,
};
export const REF = (what: string, example: string) =>
  `The ${what}: its id or its readable name (e.g. '${example}'). Several matches return the candidates and nothing ` +
  "else (error ai.reference_ambiguous); no match returns not_found with up to 5 nearest names.";
export const TZ = "IANA time zone of the keeper, e.g. Europe/Berlin (decides what 'today' is).";

/** The tool's input schema: the check's fields with a description each (throws when one is missing). */
export function inputOf(check: object, descriptions: Readonly<Record<string, string>>): Json {
  const derived = (jsonSchemaOf(check) ?? {}) as { properties?: Record<string, JsonSchema> };
  const properties = Object.fromEntries(
    Object.entries(derived.properties ?? {}).map(([k, json]) => {
      const description = descriptions[k];
      if (!description) throw new Error(`No description for the argument ${k}`);
      return [k, { ...json, description }];
    }),
  );
  return { ...derived, properties };
}

const READ = { readOnly: true } as const;

export const COLLECTION_TOOLS: readonly McpTool[] = [
  {
    name: "search_species",
    title: "Search the species catalog",
    description:
      "Searches the species visible to the keeper (approved ones and own proposals) by Latin name, German name or " +
      "synonym, like the catalog of the app. Use it before proposing a species: if it exists, use its id.",
    operation: "search_species",
    inputSchema: inputOf(searchSpeciesSchema, {
      query: "Part of a Latin name, German name or synonym, at least 2 characters.",
      ...PAGE,
    }),
    ...READ,
    request: (a) => ({
      method: "GET",
      path: query("/mcp/species", a, ["query", "offset", "limit"]),
    }),
  },
  {
    name: "get_species",
    title: "Species profile",
    description: "The full profile of one species of the catalog, as the app shows it.",
    operation: "get_species",
    inputSchema: inputOf(getSpeciesSchema, { species: REF("species", "Aloe vera") }),
    ...READ,
    request: (a) => ({ method: "GET", path: `/mcp/species/${seg(a["species"])}` }),
  },
  {
    name: "list_specimens",
    title: "My specimens",
    description:
      "The keeper's specimens with species, location, effective light zone and status, each with id and name. " +
      "Active ones by default; filter by species, location or light zone by id or name.",
    operation: "list_specimens",
    inputSchema: inputOf(listSpecimensSchema, {
      timeZone: TZ,
      status: "active (default), archived or all.",
      species: REF("species", "Aloe vera"),
      location: REF("location", "Regal 2"),
      lightZone: REF("light zone; its number works too", "3"),
      ...PAGE,
    }),
    ...READ,
    request: (a) => ({
      method: "GET",
      path: query("/mcp/specimens", a, [
        "timeZone",
        "status",
        "species",
        "location",
        "lightZone",
        "offset",
        "limit",
      ]),
    }),
  },
  {
    name: "get_specimen",
    title: "One specimen",
    description:
      "One specimen with species, location, effective light zone, status and its stored fields.",
    operation: "get_specimen",
    inputSchema: inputOf(getSpecimenSchema, {
      specimen: REF("specimen (species name with marker)", "Aloe vera – blau"),
      timeZone: TZ,
    }),
    ...READ,
    request: (a) => ({
      method: "GET",
      path: query(`/mcp/specimens/${seg(a["specimen"])}`, a, ["timeZone"]),
    }),
  },
  {
    name: "list_measurements",
    title: "Measurements of a specimen",
    description:
      "The measurements of one specimen, newest first, with the growth trend the app computes. Do not recompute it.",
    operation: "list_measurements",
    inputSchema: inputOf(listMeasurementsSchema, {
      specimen: REF("specimen (species name with marker)", "Aloe vera – blau"),
      ...PAGE,
    }),
    ...READ,
    request: (a) => ({
      method: "GET",
      path: query(`/mcp/specimens/${seg(a["specimen"])}/measurements`, a, ["offset", "limit"]),
    }),
  },
  {
    name: "list_locations",
    title: "My locations",
    description: "The keeper's locations with id, name, kind and light zone (id, name, number).",
    operation: "list_locations",
    inputSchema: inputOf(listPlacesSchema, PAGE),
    ...READ,
    request: (a) => ({ method: "GET", path: query("/mcp/locations", a, ["offset", "limit"]) }),
  },
  {
    name: "list_light_zones",
    title: "My light zones",
    description:
      "The keeper's light zones with id, number (1 = cutting light, 2 to 4 for adult plants), name and lux ceiling.",
    operation: "list_light_zones",
    inputSchema: inputOf(listPlacesSchema, PAGE),
    ...READ,
    request: (a) => ({ method: "GET", path: query("/mcp/light-zones", a, ["offset", "limit"]) }),
  },
];
