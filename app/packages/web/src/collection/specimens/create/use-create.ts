import { useCallback, useState } from "react";
import type { LightZone, Species, Specimen } from "@pflanzendex/core";
import { REFERENCE_STALE_TIME, useRequest } from "../../../shared/data";
import { ZONES_KEY, loadZones } from "../../../light";
import type { ApiError } from "../../../shared/data";
import type { CreateInput } from "./create-input";
import { createSpecimen } from "../model/specimens-api";
import { SIGN_IN, type Token } from "../hooks/use-collection";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import table from "./create.de.json";

const tx = texts(table);
const CUTTING_STATUS = "cutting" as const;

/** What the page says after a specimen was created (US-BES-02, US-BES-04): one toast text, nothing inserted above the list. */
export function createdText(specimen: Specimen): string {
  const cutting = specimen.status === CUTTING_STATUS;
  const head = tx(cutting ? "cutting" : "plant", { name: specimen.name });
  const cuttingLight = cutting ? tx("cuttingLight") : "";
  const location = specimen.locationId === null ? tx("unknownLocation") : "";
  return head + cuttingLight + location;
}

/**
 * State and action for creating a specimen of the chosen species (US-BES-02, US-BES-03). After success the page reloads
 * (`after`), the result is a toast (`say`, DS-54) and the caller learns that the creation is complete and gets the new
 * specimen (US-WUN-05 links it to its wish).
 */
export function useCreate(
  api: string,
  token: Token,
  newSpecies: Species | null,
  on: { after: () => void; completed: (specimen: Specimen) => void; say: Say },
) {
  const [created, setCreated] = useState<Specimen | null>(null);
  const { after, completed, say } = on;
  const zones = useZones(api, token, !!newSpecies);
  const send = useCallback(
    async (input: CreateInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !newSpecies) return SIGN_IN;
      const r = await createSpecimen(api, t, { speciesId: newSpecies.id, ...input });
      if (!r.ok) return r.error;
      say(createdText(r.value));
      setCreated(r.value);
      after();
      completed(r.value);
      return null;
    },
    [api, token, newSpecies, after, completed, say],
  );
  return { created, send, zones };
}

/**
 * The own light zones for the zone field of the create form; loaded only while the form is open (US-LIC-02). They share
 * the copy of the zones with the light page and the other screens (issue 1244), refreshed by writes of the light data.
 */
export function useZones(api: string, token: Token, enabled: boolean) {
  const request = useRequest({
    queryKey: ZONES_KEY,
    token,
    enabled,
    staleTime: REFERENCE_STALE_TIME,
    load: (t: string) => loadZones(api, t),
  });
  return {
    items: request.value ?? ([] as readonly LightZone[]),
    failed: request.status === "error",
  };
}
