// The locations of a confirmed import (US-BES-18, US-LIC-05): a name the keeper does not have yet is created once, as an
// indoor location without a light zone ("Hints" asks for the zone then, P-09); a name that matches one of the keeper's own
// locations (normalized) uses that one. The write goes through `location.set_up` (P-03).
import { normalizeName, type ErrorCode } from "../../../kernel";
import { locationSetUp, type LightLocation, type LightLocationStore } from "../../../light";

export interface LocationBook {
  /** The id of the keeper's location for `name`, creating it if needed; or the code of the refusal. */
  resolve(name: string): Promise<{ readonly id: string } | { readonly code: ErrorCode }>;
  /** The names created by this import, in the order they were created. */
  readonly created: readonly string[];
}

const sameName = (a: string, b: string): boolean => normalizeName(a) === normalizeName(b);

/** A book over the keeper's locations as they are now (`known`); every name is looked up once and then kept. */
export function locationBook(
  store: LightLocationStore,
  userId: string,
  known: readonly LightLocation[],
): LocationBook {
  let locations = [...known];
  const created: string[] = [];
  const setUp = locationSetUp(store);

  const again = async (
    name: string,
  ): Promise<{ readonly id: string } | { readonly code: ErrorCode }> => {
    locations = [...(await store.list(userId))];
    const hit = locations.find((l) => sameName(l.name, name));
    return hit ? { id: hit.id } : { code: "location.name_taken" };
  };

  return {
    created,
    async resolve(name) {
      const hit = locations.find((l) => sameName(l.name, name));
      if (hit) return { id: hit.id };
      const input = setUp.schema({ name, kind: "indoor", lightZoneId: null });
      if (!input.ok) return { code: input.error.code };
      const r = await setUp.run({ userId }, input.value);
      if (r.ok) {
        locations = [...locations, r.value];
        created.push(r.value.name);
        return { id: r.value.id };
      }
      return r.error.code === "location.name_taken" ? again(name) : { code: r.error.code };
    },
  };
}
