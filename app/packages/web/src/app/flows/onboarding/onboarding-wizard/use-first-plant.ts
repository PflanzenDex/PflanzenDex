import { useEffect, useRef, useState } from "react";
import { specimenName, speciesDisplayName, type Species } from "@pflanzendex/core";
import { errorText } from "@/shared/lib/error-text";
import { createSpecimen } from "../../../../collection";
import { SIGN_IN } from "../../../../shared/data";
import { useOwnZones } from "./save-step/save-step";

type Token = () => Promise<string | undefined>;

/** What the first-plant flow keeps between its steps, so going back loses nothing (US-ONB-01). */
export function useFirstPlant(api: string, token: Token) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<Species | null>(null);
  const [zoneId, setZoneId] = useState("");
  // Only the flow for further plants offers a place; a shown and changeable value, never stored unseen (US-ONB-01).
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; id: string } | null>(null);
  const zones = useOwnZones(api, token, species !== null);
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
  };
  const save = async () => {
    if (!species) return;
    setSaving(true);
    const t = await token();
    // A zone is sent only when the keeper changed it: the derived one is never stored (P-01).
    const r = t
      ? await createSpecimen(api, t, {
          speciesId: species.id,
          ...(zoneId ? { lightZoneId: zoneId } : {}),
          ...(locationId ? { locationId } : {}),
        })
      : null;
    setSaving(false);
    if (!r) return setError(errorText(SIGN_IN.code));
    if (!r.ok) return setError(errorText(r.error.code));
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
    save,
  };
}
