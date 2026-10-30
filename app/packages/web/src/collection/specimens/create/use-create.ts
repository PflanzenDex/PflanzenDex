import { useCallback, useState } from "react";
import type { LightZone, Species, Specimen } from "@pflanzendex/core";
import { useRequest } from "../../../kernel";
import { loadZones } from "../../../light";
import type { ApiError } from "../../../kernel";
import type { CreateInput } from "./create-input";
import { createSpecimen } from "../model/specimens-api";
import { SIGN_IN, type Token } from "../hooks/use-collection";

/**
 * State and action for creating a specimen of the chosen species (US-BES-02, US-BES-03). After success the page reloads
 * (`after`), older messages go away (`clearMessages`) and the caller learns that the creation is complete and gets the new specimen (US-WUN-05 links it to its wish).
 */
export function useCreate(
  api: string,
  token: Token,
  newSpecies: Species | null,
  on: { after: () => void; clearMessages: () => void; completed: (specimen: Specimen) => void },
) {
  const [created, setCreated] = useState<Specimen | null>(null);
  const { after, clearMessages, completed } = on;
  const zones = useZones(api, token, !!newSpecies);
  const send = useCallback(
    async (input: CreateInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t || !newSpecies) return SIGN_IN;
      const r = await createSpecimen(api, t, { speciesId: newSpecies.id, ...input });
      if (!r.ok) return r.error;
      clearMessages();
      setCreated(r.value);
      after();
      completed(r.value);
      return null;
    },
    [api, token, newSpecies, after, clearMessages, completed],
  );
  return { created, send, zones };
}

/** The own light zones for the zone field of the create form; loaded only while the form is open (US-LIC-02). */
export function useZones(api: string, token: Token, enabled: boolean) {
  const request = useRequest({
    queryKey: ["collection", "zones"],
    token,
    enabled,
    fresh: true,
    load: (t: string) => loadZones(api, t),
  });
  return {
    items: request.value ?? ([] as readonly LightZone[]),
    failed: request.status === "error",
  };
}
