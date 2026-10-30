import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";
import type { GapSpecies } from "@pflanzendex/core";

/**
 * Read side of the gap list (US-BES-13): approved species with the fields that may be unknown and their source
 * snapshots (DM-BES-05). Runs as the caller's account; species and snapshots are shared and visible by row rule.
 */
export class CatalogGapsPostgres {
  constructor(private readonly pool: Pool) {}

  async approvedSpecies(userId: string): Promise<readonly GapSpecies[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{
        id: string;
        latinName: string;
        difficulty: number | null;
        standardLevel: number | null;
        lightDemandLux: number | null;
        germanName: string | null;
        englishName: string | null;
        familyGerman: string | null;
        familyLatin: string | null;
        dormancy: string | null;
        locationHint: string | null;
        wateringHint: string | null;
        substrate: string | null;
        pruning: string | null;
        growthHacks: string | null;
        botanicalStory: string | null;
        growthMeasure: string | null;
        etiolationSigns: string | null;
        successCriteria: string | null;
        checks: { source: "gbif" | "wikidata" | "wikipedia"; retrievedAt: string }[];
      }>(
        `select a.id, a.latin_name as "latinName", a.difficulty, a.standard_level as "standardLevel",
                a.light_demand_lux as "lightDemandLux", a.german_name as "germanName", a.english_name as "englishName",
                a.family_german as "familyGerman", a.family_latin as "familyLatin", a.dormancy_from as dormancy,
                a.location_hint as "locationHint", a.watering_hint as "wateringHint", a.substrate, a.pruning,
                a.growth_hacks as "growthHacks", a.botanical_story as "botanicalStory",
                a.growth_measure as "growthMeasure", a.etiolation_signs as "etiolationSigns",
                a.success_criteria as "successCriteria",
                coalesce((select json_agg(json_build_object('source', s.source,
                            'retrievedAt', to_char(s.retrieved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
                            from catalog_source_snapshot s where s.species_id = a.id), '[]'::json) as checks
           from species a
          where species_status(a.id) in ('curated', 'reviewed')
          order by a.latin_name`,
      ),
    );
    return r.rows.map(({ id, latinName, checks, ...values }) => ({
      id,
      latinName,
      checks,
      values,
    }));
  }
}
