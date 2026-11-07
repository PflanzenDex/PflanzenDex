import { useRef } from "react";
import type { Species } from "@pflanzendex/core";
import { loadSpecies } from "@/catalog";
import { useRequest, type Response } from "@/shared/data";

type Token = () => Promise<string | undefined>;

/** The cultivars of the chosen plants: `cultivarOf` is `null` for a species without one or one that could not be read. */
export type LabelCultivars = {
  status: "pending" | "ready";
  cultivarOf: (speciesId: string) => string | null;
  /** At least one species could not be read: its labels show the name only, and the page says so (P-10). */
  unreadable: boolean;
};

const NONE: LabelCultivars = { status: "ready", cultivarOf: () => null, unreadable: false };

/**
 * The cultivar of each species of the chosen plants (US-BES-17, criterion 3). A plant's read does not carry the cultivar,
 * its species read does. Each species is read once while the page is open, a failed read is read again later.
 */
export function useLabelCultivars(
  api: string,
  token: Token,
  speciesIds: readonly string[],
): LabelCultivars {
  const reads = useRef(new Map<string, Promise<Response<Species>>>());
  const ids = [...new Set(speciesIds)].sort();
  const request = useRequest({
    queryKey: ["labels", "cultivars", ids],
    token,
    enabled: ids.length > 0,
    load: async (t) => {
      const answers = await Promise.all(ids.map((id) => readOnce(id, t)));
      const cultivars = new Map<string, string | null>();
      let unreadable = false;
      answers.forEach((answer, i) => {
        const id = ids[i] ?? "";
        if (answer?.ok) cultivars.set(id, answer.value.cultivar);
        else {
          cultivars.set(id, null);
          unreadable = true;
        }
      });
      return { ok: true, value: { cultivars, unreadable } };
    },
  });

  // Same species, same answer: the reads are kept by species, not by the set of chosen plants.
  function readOnce(id: string, t: string): Promise<Response<Species> | undefined> {
    const known = reads.current.get(id);
    const read = known ?? loadSpecies(api, t, id);
    if (!known) reads.current.set(id, read);
    return read
      .then((answer) => {
        if (!answer.ok) reads.current.delete(id);
        return answer;
      })
      .catch(() => {
        reads.current.delete(id);
        return undefined;
      });
  }

  if (ids.length === 0) return NONE;
  const value = request.value;
  return {
    status: request.status === "pending" ? "pending" : "ready",
    cultivarOf: (speciesId) => value?.cultivars.get(speciesId) ?? null,
    unreadable: request.status === "error" || (value?.unreadable ?? false),
  };
}
