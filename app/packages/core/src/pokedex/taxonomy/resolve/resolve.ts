import { appError, failed, ok } from "../../../kernel";
import type { Result, SourceClient } from "../../../kernel";
import { asText, dig } from "../types";
import type { FailureReason, TaxonFailure, TaxonLineage } from "../types";
import { taxonInfo, tnrsMatch } from "./requests";

const BATCH = 100; // names per TNRS request (assumption)

export interface Resolution {
  readonly resolved: ReadonlyMap<string, TaxonLineage>;
  readonly failures: readonly TaxonFailure[];
}

interface Hit {
  readonly ottId: number;
  readonly acceptedName: string;
}

const invalid = (what: string) => failed(appError("source.response_invalid", { cause: what }));

/**
 * Best exact hit of a TNRS result: land plant, rank species. A synonym hit counts (renamed genus) and is kept under
 * the accepted name; approximate hits are ignored.
 */
function pick(result: unknown): Hit | FailureReason {
  const matches = dig(result, "matches");
  if (!Array.isArray(matches)) return "taxonomy.no_match";
  const exact = matches.filter((m) => dig(m, "is_approximate_match") !== true);
  if (exact.length === 0) return "taxonomy.no_match";
  const species = exact.filter((m) => dig(m, "taxon", "rank") === "species");
  const best = species.find((m) => dig(m, "is_synonym") !== true) ?? species[0];
  const ottId = dig(best, "taxon", "ott_id");
  const acceptedName = asText(dig(best, "taxon", "unique_name") ?? dig(best, "taxon", "name"));
  if (best === undefined) return "taxonomy.not_species";
  return typeof ottId === "number" && acceptedName !== null
    ? { ottId, acceptedName }
    : "taxonomy.no_match";
}

async function lineageOf(sources: SourceClient, hit: Hit): Promise<Result<Outcome>> {
  const r = await sources.get(taxonInfo(hit.ottId));
  if (!r.ok) return r;
  if (r.value.kind === "not_found") return ok("taxonomy.lineage_missing");
  const lineage = dig(r.value.data, "lineage");
  if (!Array.isArray(lineage)) return invalid("taxon_info without lineage");
  const named = (rank: string) =>
    asText(
      dig(
        lineage.find((l) => dig(l, "rank") === rank),
        "name",
      ),
    );
  const genus = named("genus") ?? hit.acceptedName.split(" ")[0] ?? null;
  if (genus === null) return ok("taxonomy.lineage_missing");
  return ok({
    ...hit,
    genus,
    family: named("family"),
    order: named("order"),
    provenance: r.value.provenance,
  });
}

type Outcome = TaxonLineage | FailureReason;

async function resolveOne(sources: SourceClient, result: unknown): Promise<Result<Outcome>> {
  const hit = pick(result);
  return typeof hit === "string" ? ok(hit) : lineageOf(sources, hit);
}

/** One TNRS request for `batch`, then the lineage of each hit; fills `into`. */
async function resolveBatch(
  sources: SourceClient,
  batch: readonly string[],
  into: { resolved: Map<string, TaxonLineage>; failures: TaxonFailure[] },
): Promise<Result<null>> {
  const r = await sources.get(tnrsMatch(batch));
  if (!r.ok) return r;
  const results = r.value.kind === "found" ? dig(r.value.data, "results") : [];
  if (!Array.isArray(results)) return invalid("tnrs without results");
  for (const name of batch) {
    const one = await resolveOne(
      sources,
      results.find((x) => dig(x, "name") === name),
    );
    if (!one.ok) return one;
    if (typeof one.value === "string") into.failures.push({ latinName: name, reason: one.value });
    else into.resolved.set(name, one.value);
  }
  return ok(null);
}

/** OpenTree TNRS (land plants, rank species), then the lineage per hit. A source failure aborts (kept tree stays). */
export async function resolveLineages(
  sources: SourceClient,
  names: readonly string[],
): Promise<Result<Resolution>> {
  const into = { resolved: new Map<string, TaxonLineage>(), failures: [] as TaxonFailure[] };
  for (let i = 0; i < names.length; i += BATCH) {
    const done = await resolveBatch(sources, names.slice(i, i + BATCH), into);
    if (!done.ok) return done;
  }
  return ok(into);
}
