import { useEffect, useRef, useState } from "react";
import { specimenName, speciesDisplayName, type Species } from "@pflanzendex/core";
import { errorText } from "@/lib/error-text";
import { createSpecimen } from "../../collection";
import { SIGN_IN } from "../../kernel";
import { useOwnZones } from "./save-step/save-step";

type Token = () => Promise<string | undefined>;

/** What the first-plant flow keeps between its steps, so going back loses nothing (US-ONB-01). */
export function useFirstPlant(api: string, token: Token) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<Species | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const zones = useOwnZones(api, token, species !== null);
  // A button that unmounts takes the focus with it: move it to the heading of the new step (not on first render).
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) box.current?.querySelector("h2")?.focus();
    moved.current = true;
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
        })
      : null;
    setSaving(false);
    if (!r) return setError(errorText(SIGN_IN.code));
    if (!r.ok) return setError(errorText(r.error.code));
    setCreated(specimenName(speciesDisplayName(species), null));
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
    error,
    saving,
    created,
    zones,
    save,
  };
}
