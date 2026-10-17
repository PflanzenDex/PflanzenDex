import type { SourceRequest } from "../../../kernel";

/** TNRS: land plants only, exact matching (a fuzzy hit would invent a species, P-08). */
export const tnrsMatch = (names: readonly string[]): SourceRequest => ({
  source: "opentree",
  path: "/tnrs/match_names",
  body: { names, context_name: "Land plants", do_approximate_matching: false },
});

export const taxonInfo = (ottId: number): SourceRequest => ({
  source: "opentree",
  path: "/taxonomy/taxon_info",
  body: { ott_id: ottId, include_lineage: true },
});
