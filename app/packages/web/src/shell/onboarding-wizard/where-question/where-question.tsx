import { useEffect, useState } from "react";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { errorText } from "@/lib/error-text";
import { setSpecimenLocation } from "../../../collection";
import { createWrite } from "../../../kernel";
import { loadLocations, loadZones } from "../../../light";

type Token = () => Promise<string | undefined>;

/**
 * Makes sure the account has a place for the first plant: the server lays out the default location "Zuhause" only for
 * an account without locations and refuses otherwise (US-ONB-02); the refusal is the normal case, so it is ignored.
 */
export async function ensureHome(api: string, token: string): Promise<void> {
  const own = await loadLocations(api, token);
  if (own.ok && own.value.length === 0)
    await createWrite(api, token)("POST", "/locations/defaults", {});
}

interface Places {
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

function usePlaces(api: string, token: Token): Places | null {
  const [places, setPlaces] = useState<Places | null>(null);
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return;
      await ensureHome(api, t);
      const [l, z] = await Promise.all([loadLocations(api, t), loadZones(api, t)]);
      if (current && l.ok && z.ok) setPlaces({ locations: l.value, zones: z.value });
    })();
    return () => {
      current = false;
    };
  }, [api, token]);
  return places;
}

function ZoneChoice(props: {
  name: string;
  zones: readonly LightZone[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      <Label htmlFor="first-plant-location-zone">{`Licht bei ${props.name}`}</Label>
      <Select
        id="first-plant-location-zone"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">Keine Angabe</option>
        {props.zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </Select>
    </>
  );
}

/** Sets the location of the plant; a location without a light zone gets the zone the keeper names (their own choice, never invented). */
async function placeSpecimen(
  p: { api: string; token: Token; specimenId: string },
  chosen: LightLocation,
  zoneId: string,
) {
  const t = await p.token();
  if (!t) return { ok: false as const, error: { code: "access.not_signed_in" } };
  const set = await setSpecimenLocation(p.api, t, { id: p.specimenId, locationId: chosen.id });
  if (!set.ok || chosen.lightZoneId !== null || !zoneId) return set;
  return createWrite(p.api, t)("PUT", `/locations/${chosen.id}`, {
    name: chosen.name,
    kind: chosen.kind,
    lightZoneId: zoneId,
  });
}

/**
 * After the first plant is saved: one question at the plant, once (US-ONB-02). "Später" leaves the plant without a
 * place, which is no error; the collection shows it as "ohne Standort" with the way to set it. The question is a
 * hint, not a step.
 */
export function WhereQuestion(props: {
  api: string;
  token: Token;
  specimenId: string;
  onDone: () => void;
}) {
  const places = usePlaces(props.api, props.token);
  const [locationId, setLocationId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!places || places.locations.length === 0) return null;
  const chosen = places.locations.find((l) => l.id === (locationId || places.locations[0]?.id));
  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    const r = await placeSpecimen(props, chosen, zoneId);
    setSaving(false);
    if (!r.ok) return setError(errorText(r.error.code));
    props.onDone();
  };
  return (
    <section className="flex flex-col gap-3">
      <Label htmlFor="first-plant-location">Wo steht sie?</Label>
      <Select
        id="first-plant-location"
        value={chosen?.id ?? ""}
        onChange={(e) => setLocationId(e.target.value)}
      >
        {places.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      {chosen && chosen.lightZoneId === null && (
        <ZoneChoice name={chosen.name} zones={places.zones} value={zoneId} onChange={setZoneId} />
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          Hier steht sie
        </Button>
        <Button type="button" variant="secondary" onClick={props.onDone}>
          Später
        </Button>
      </div>
    </section>
  );
}
