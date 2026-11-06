import { defineOperation, appError, failed, ok } from "../../../kernel";
import { speciesSchema, type SpeciesInput } from "./fields";
import { normalize } from "./name";
import { withExactBeyondCap } from "../lookup/search";
import type { Species, SpeciesName, SpeciesStore, SpeciesValues, NameField } from "../types";

function valueFrom(e: SpeciesInput): SpeciesValues {
  const { latinName: name, ...rest } = e;
  return {
    ...rest,
    latinName: name.display,
    genus: name.genus,
    epithet: name.epithet,
    cultivar: name.cultivar,
  };
}

/** All names of the species with key; duplicate keys (e.g. a synonym equal to the name) count once. */
export function namesFrom(w: SpeciesValues): SpeciesName[] {
  const raw: [NameField, string | null][] = [
    ["latin", w.latinName],
    ["german", w.germanName],
    ["english", w.englishName],
    ...w.synonyms.map((s): [NameField, string] => ["synonym", s]),
  ];
  const all = raw.flatMap(([field, display]): SpeciesName[] =>
    display ? [{ field, display, norm: normalize(display) }] : [],
  );
  const seen = new Set<string>();
  return all.filter((n) => {
    const key = `${n.field === "synonym" ? "latin" : n.field}:${n.norm}`;
    const fresh = n.norm !== "" && !seen.has(key);
    seen.add(key);
    return fresh;
  });
}

/**
 * The visible species a proposal would duplicate (FR-BES-03): the same rule as on creation, a Latin name or synonym of
 * the input equals a Latin name or synonym of a visible species. `null` when the input is invalid or new. Lets a caller
 * name the existing species before anything is stored (US-KI-11).
 */
export async function speciesExisting(
  store: Pick<SpeciesStore, "search" | "exact">,
  userId: string,
  input: unknown,
): Promise<Species | null> {
  const r = speciesSchema(input);
  if (!r.ok) return null;
  const keys = namesFrom(valueFrom(r.value)).filter(
    (n) => n.field === "latin" || n.field === "synonym",
  );
  for (const key of keys) {
    const sameName = (h: Species) =>
      [h.latinName, ...h.synonyms].some((n) => normalize(n) === key.norm);
    // An exact match beyond the cap of the search counts too (FR-BES-24).
    const hits = await withExactBeyondCap(await store.search(userId, key.norm), sameName, () =>
      store.exact(userId, key.norm),
    );
    const same = hits.find(sameName);
    if (same) return same;
  }
  return null;
}

/**
 * Creates a species as a proposal: review status `proposal`, visible only to the creator, entry in the review list
 * (FR-BES-11, US-BES-10). This is the manual path without AI (FR-KI-05). If the species (or a synonym) is already
 * visibly present, nothing is created and the existing species is referenced instead (FR-BES-03).
 */
export const speciesPropose = (store: SpeciesStore) =>
  defineOperation({
    name: "species.propose",
    schema: speciesSchema,
    run: async (context, input) => {
      const values = valueFrom(input);
      const r = await store.create(context.userId, values, namesFrom(values));
      return r.kind === "fresh"
        ? ok(r.value)
        : failed(appError("species.duplicate", { data: { existing: r.value } }));
    },
  });
