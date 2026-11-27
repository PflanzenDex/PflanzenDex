import { useCallback, useEffect, useRef, useState } from "react";
import { type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { localToday, specimenName, speciesDisplayName, type Species } from "@pflanzendex/core";
import { refusalText } from "@/shared/lib/error-text";
import { useServerRefusal } from "@/shared/ui/form.server-refusal";
import {
  createSchema,
  createSpecimen,
  markerFormStart,
  markerInputOf,
  createStart,
  markerRefusalFields,
  refusesMarker,
  type CreateFields,
  type MarkerRule,
} from "../../../../collection";
import { currentTimeZone, SIGN_IN, type ApiError, useRepeatKey } from "../../../../shared/data";
import { FIRST_PLANT, useSaveFailure } from "./save-step/save-failure";
import { useOwnZones } from "./save-step/use-own-zones";
import { useFieldForm } from "@/shared/ui/form";

type Token = () => Promise<string | undefined>;

/** Before the species is read: no marker is asked yet (the first plant of a species). */
const NO_RULE = { required: false, missing: [] } as const;

/**
 * The marker is checked before anything is sent (F-0093, US-QS-32): a missing one takes its message and the focus, and
 * the save stops. Resolves to whether the form is valid.
 */
async function markerChecked(form: UseFormReturn<CreateFields>): Promise<boolean> {
  let valid = false;
  await form.handleSubmit(() => {
    valid = true;
  })();
  return valid;
}

/**
 * What the first plant sends (US-ONB-01): the marker as it is typed (the server refuses a missing one and names its field,
 * US-BES-03), and a zone or a place only when the keeper changed it, so the derived zone is never stored (P-01).
 */
async function createPlant(args: {
  api: string;
  token: Token;
  species: Species;
  marker: { form: UseFormReturn<CreateFields> };
  // The rule is known when the save starts (`save` rules out a missing one before anything is sent).
  rule: MarkerRule;
  zoneId: string;
  locationId: string;
  keys: ReturnType<typeof useRepeatKey>;
}) {
  const { api, token, species, marker, rule, zoneId, locationId, keys } = args;
  const t = await token();
  if (!t) return { ok: false as const, error: SIGN_IN };
  // A create: the action names the operation only. The first plant as typed (species, marker, zone, place) is the body:
  // a changed form after a lost answer gets `idempotency.key_conflict`, not a second plant (US-QS-03).
  return keys.run(
    (key) =>
      createSpecimen(
        api,
        t,
        {
          speciesId: species.id,
          ...markerInputOf(marker.form.getValues(), rule.missing),
          ...(zoneId ? { lightZoneId: zoneId } : {}),
          ...(locationId ? { locationId } : {}),
        },
        { key },
      ),
    FIRST_PLANT,
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
  // The schema of the species' rule is read at each check: the rule comes with the section of step 2 (F-0093).
  const ruleNow = useRef<MarkerRule | null>(null);
  const resolver = useCallback<Resolver<CreateFields>>(
    (values, context, options) =>
      zodResolver(createSchema(ruleNow.current ?? NO_RULE))(values, context, options),
    [],
  );
  const form = useFieldForm<CreateFields>({ resolver, defaultValues: markerFormStart(today) });
  useServerRefusal(refusal, form.setError, markerRefusalFields);
  // The form takes the preset of the long form once per species and rule. A step that comes back for the same species
  // keeps the marker the keeper typed (US-ONB-01), so the preset is not set again on every visit.
  const presetOf = useRef<string | null>(null);
  const report = useCallback(
    (r: MarkerRule | null) => {
      ruleNow.current = r;
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
  const failure = useSaveFailure();
  // A refused marker goes to its field (US-BES-03, US-QS-15); every other refusal is shown as text.
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; id: string } | null>(null);
  // The zones keep the species, the marker and the zone choice across a failure and its retry (issue 2098).
  const own = useOwnZones(api, token, species !== null);
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
  // The held key of the first plant: a lost answer repeats the same create under it (US-QS-03).
  const keys = useRepeatKey();
  const pick = (s: Species) => {
    setSpecies(s);
    setZoneId("");
    failure.reset();
    setRefusal(null);
  };
  const save = async () => {
    // Ruled out before anything is sent: no species or no marker rule yet (the rule comes with step 2). The save button
    // holds the press back while the rule is read and shows the wait, so this never swallows a press (US-QS-03, P-10).
    const rule = marker.rule;
    if (!species || !rule || !(await markerChecked(marker.form))) return;
    setSaving(true);
    const r = await createPlant({ api, token, species, marker, rule, zoneId, locationId, keys });
    setSaving(false);
    if (!r.ok) return refusesMarker(r.error) ? setRefusal(r.error) : failure.show(r.error);
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
    error: failure.text,
    dismissError: failure.dismiss,
    saving,
    created,
    zones: own.zones,
    /** The German reason the zones could not be read or made, by its code (P-10); `null` while none is held. */
    zonesError: own.error ? refusalText(own.error) : null,
    retryZones: own.retry,
    marker,
    save,
  };
}
