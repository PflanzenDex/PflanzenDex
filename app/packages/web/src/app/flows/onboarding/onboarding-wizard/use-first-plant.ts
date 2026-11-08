import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { specimenName, speciesDisplayName, type Species } from "@pflanzendex/core";
import { errorText } from "@/shared/lib/error-text";
import { useServerRefusal } from "@/shared/ui/fields/form/server-refusal";
import {
  createSpecimen,
  markerFormStart,
  markerInputOf,
  markerRefusalFields,
  refusesMarker,
  useFurtherMarker,
  useToday,
  type CreateFields,
  type FurtherMarker,
} from "../../../../collection";
import { SIGN_IN, type ApiError } from "../../../../shared/data";
import { useOwnZones } from "./save-step/save-step";

type Token = () => Promise<string | undefined>;

/**
 * What the first plant sends (US-ONB-01): the marker as it is typed (the server refuses a missing one and names its field,
 * US-BES-03), and a zone or a place only when the keeper changed it, so the derived zone is never stored (P-01).
 */
async function createPlant(args: {
  api: string;
  token: Token;
  species: Species;
  marker: FurtherMarker;
  zoneId: string;
  locationId: string;
}) {
  const { api, token, species, marker, zoneId, locationId } = args;
  const t = await token();
  const rule = marker.rule;
  if (!t || !rule) return null;
  return createSpecimen(api, t, {
    speciesId: species.id,
    ...markerInputOf(marker.form.getValues(), rule.missing),
    ...(zoneId ? { lightZoneId: zoneId } : {}),
    ...(locationId ? { locationId } : {}),
  });
}

/** What the first-plant flow keeps between its steps, so going back loses nothing (US-ONB-01). */
export function useFirstPlant(api: string, token: Token) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<Species | null>(null);
  const [zoneId, setZoneId] = useState("");
  // Only the flow for further plants offers a place; a shown and changeable value, never stored unseen (US-ONB-01).
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A refused marker goes to its field (US-BES-03, US-QS-15); every other refusal is shown as text.
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; id: string } | null>(null);
  const zones = useOwnZones(api, token, species !== null);
  // The marker form belongs to this flow, so a typed marker survives going back (US-ONB-01); the refused marker takes its
  // field and the focus there (US-QS-15). Both live here, not in the marker hook, which the flow reaches through the
  // barrel: the barrel stays free of the form and refusal modules (issue 1638).
  const form = useForm<CreateFields>({ defaultValues: markerFormStart(useToday()) });
  const marker = useFurtherMarker({ form, api, token, speciesId: species?.id ?? null, refusal });
  useServerRefusal(refusal, form.setError, markerRefusalFields);
  // A button that unmounts takes the focus with it: move it to the heading of the new step. Comparing the step, not
  // counting runs: StrictMode runs the effect twice on mount, and the flow must not take the focus by appearing (issue 1362).
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef({ index, created });
  useEffect(() => {
    if (shown.current.index === index && shown.current.created === created) return;
    shown.current = { index, created };
    box.current?.querySelector("h2")?.focus();
  }, [index, created]);
  const pick = (s: Species) => {
    setSpecies(s);
    setZoneId("");
    setError(null);
    setRefusal(null);
  };
  const save = async () => {
    if (!species || !marker.rule) return;
    setSaving(true);
    const r = await createPlant({ api, token, species, marker, zoneId, locationId });
    setSaving(false);
    if (!r) return setError(errorText(SIGN_IN.code));
    if (!r.ok)
      return refusesMarker(r.error) ? setRefusal(r.error) : setError(errorText(r.error.code));
    setCreated({ name: specimenName(speciesDisplayName(species), null), id: r.value.id });
  };
  return {
    box,
    index,
    setIndex,
    text,
    setText,
    species,
    pick,
    zoneId,
    setZoneId,
    locationId,
    setLocationId,
    error,
    saving,
    created,
    zones,
    marker,
    save,
  };
}
