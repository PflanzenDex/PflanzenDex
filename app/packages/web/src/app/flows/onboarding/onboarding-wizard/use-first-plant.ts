import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { localToday, specimenName, speciesDisplayName, type Species } from "@pflanzendex/core";
import { errorText } from "@/shared/lib/error-text";
import { useServerRefusal } from "@/shared/ui/fields/form/server-refusal";
import {
  createSpecimen,
  markerFormStart,
  markerInputOf,
  createStart,
  markerRefusalFields,
  refusesMarker,
  type CreateFields,
  type MarkerRule,
} from "../../../../collection";
import {
  currentTimeZone,
  SIGN_IN,
  type ApiError,
  useRepeatKey,
  type WriteOptions,
} from "../../../../shared/data";
import { useOwnZones } from "./save-step/save-step";

type Token = () => Promise<string | undefined>;

/**
 * What the first plant sends (US-ONB-01): the marker as it is typed (the server refuses a missing one and names its field,
 * US-BES-03), and a zone or a place only when the keeper changed it, so the derived zone is never stored (P-01).
 */
async function createPlant(
  args: {
    api: string;
    token: Token;
    species: Species;
    marker: { form: UseFormReturn<CreateFields>; rule: MarkerRule | null };
    zoneId: string;
    locationId: string;
  },
  options: WriteOptions = {},
) {
  const { api, token, species, marker, zoneId, locationId } = args;
  const t = await token();
  const rule = marker.rule;
  if (!t || !rule) return null;
  return createSpecimen(
    api,
    t,
    {
      speciesId: species.id,
      ...markerInputOf(marker.form.getValues(), rule.missing),
      ...(zoneId ? { lightZoneId: zoneId } : {}),
      ...(locationId ? { locationId } : {}),
    },
    { key: options.key },
  );
}

/**
 * The marker part of the flow (US-BES-03, US-ONB-01, issue 1638). The form belongs to the flow, so a typed marker survives
 * going back; a refused marker takes its field and the focus there (US-QS-15). The rule of the chosen species comes from
 * its section on step 2, which reports it here, and the save waits for it.
 */
function useMarkerPart(
  speciesId: string | null,
  api: string,
  token: Token,
  refusal: ApiError | null,
) {
  const [rule, setRule] = useState<MarkerRule | null>(null);
  const today = localToday(new Date(), currentTimeZone());
  const form = useForm<CreateFields>({ defaultValues: markerFormStart(today) });
  useServerRefusal(refusal, form.setError, markerRefusalFields);
  // The form takes the preset of the long form once per species and rule. A step that comes back for the same species
  // keeps the marker the keeper typed (US-ONB-01), so the preset is not set again on every visit.
  const presetOf = useRef<string | null>(null);
  const report = useCallback(
    (r: MarkerRule | null) => {
      setRule(r);
      if (!r) return;
      const key = [speciesId, r.required, r.preset, r.missing.map((s) => s.id).join(",")].join("|");
      if (presetOf.current === key) return;
      presetOf.current = key;
      form.reset(createStart(r, today));
    },
    [form, today, speciesId],
  );
  return { form, rule, api, token, refusal, report };
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
  // The first plant is one action: a repeat after a lost answer repeats the same creation (US-QS-03, no second plant).
  const keys = useRepeatKey();
  // A refused marker goes to its field (US-BES-03, US-QS-15); every other refusal is shown as text.
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; id: string } | null>(null);
  const zones = useOwnZones(api, token, species !== null);
  const marker = useMarkerPart(species?.id ?? null, api, token, refusal);
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
    const key = keys.take();
    const r = await createPlant({ api, token, species, marker, zoneId, locationId }, { key });
    if (r) keys.settle(key, r);
    else keys.drop();
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
