import { useEffect, useState } from "react";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { Label } from "@/shared/ui/display/label/label";
import { Select } from "@/shared/ui/fields/select/select";
import { errorText } from "@/shared/lib/error-text";
import { setSpecimenLocation } from "../../../../../collection";
import { SIGN_IN, createWrite, useQueryClient, type QueryClient } from "../../../../../shared/data";
import { refreshLight, sharedLocations, sharedZones } from "../../../../../light";
import { zoneLabel } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./where-question.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/** The note after a save: the place and, when it has one, its light zone (P-10). */
const savedText = (name: string, zone: LightZone | undefined) =>
  ui("saved", { name, zone: zone ? `, ${zoneLabel(zone.name)}` : "" });

/**
 * Makes sure the account has a place for the first plant: the server lays out the default location "Zuhause" only for
 * an account without locations and refuses otherwise (US-ONB-02); the refusal is the normal case, so it is ignored.
 * A location that was laid out refreshes the shared light data (issue 1244).
 */
export async function ensureHome(client: QueryClient, api: string, token: string): Promise<void> {
  const own = await sharedLocations(client, api, token);
  if (own.ok && own.value.length === 0) {
    const made = await createWrite(api, token)("POST", "/locations/defaults", {});
    if (made.ok) await refreshLight(client);
  }
}

interface Places {
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

function usePlaces(api: string, token: Token): Places | null {
  const [places, setPlaces] = useState<Places | null>(null);
  const client = useQueryClient();
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return;
      await ensureHome(client, api, t);
      const [l, z] = await Promise.all([
        sharedLocations(client, api, t),
        sharedZones(client, api, t),
      ]);
      if (current && l.ok && z.ok) setPlaces({ locations: l.value, zones: z.value });
    })();
    return () => {
      current = false;
    };
  }, [api, token, client]);
  return places;
}

/** The location with the light it stands under, so the choice shows what it brings with it (P-10). */
const zoneOf = (l: LightLocation, zones: readonly LightZone[]) => {
  const z = zones.find((x) => x.id === l.lightZoneId);
  return z ? `${l.name} (${zoneLabel(z.name)})` : l.name;
};

function ZoneChoice(props: {
  name: string;
  zones: readonly LightZone[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      <Label htmlFor="first-plant-location-zone">{ui("zoneFor", { name: props.name })}</Label>
      <Select
        id="first-plant-location-zone"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{ui("noZone")}</option>
        {props.zones.map((z) => (
          <option key={z.id} value={z.id}>
            {zoneLabel(z.name)}
          </option>
        ))}
      </Select>
    </>
  );
}

/** Sets the location of the plant; a location without a light zone gets the zone the keeper names (their own choice, never invented). */
async function placeSpecimen(
  client: QueryClient,
  p: { api: string; token: Token; specimenId: string },
  chosen: LightLocation,
  zoneId: string,
) {
  const t = await p.token();
  if (!t) return { ok: false as const, error: SIGN_IN };
  const set = await setSpecimenLocation(p.api, t, { id: p.specimenId, locationId: chosen.id });
  if (!set.ok || chosen.lightZoneId !== null || !zoneId) return set;
  const named = await createWrite(p.api, t)("PUT", `/locations/${chosen.id}`, {
    name: chosen.name,
    kind: chosen.kind,
    lightZoneId: zoneId,
  });
  // The location now stands under a light zone: the shared copies of the light data are asked again (issue 1244).
  if (named.ok) await refreshLight(client);
  return named;
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
  /** `note` says what was saved (P-10); without it nothing was changed. */
  onDone: (note?: string) => void;
}) {
  const places = usePlaces(props.api, props.token);
  const client = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!places || places.locations.length === 0) return null;
  const chosen = places.locations.find((l) => l.id === (locationId || places.locations[0]?.id));
  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    const r = await placeSpecimen(client, props, chosen, zoneId);
    setSaving(false);
    if (!r.ok) return setError(errorText(r.error.code));
    const zone = places.zones.find((z) => z.id === (chosen.lightZoneId ?? zoneId));
    props.onDone(savedText(chosen.name, zone));
  };
  return (
    <section className="flex flex-col gap-3">
      {places.locations.length === 1 && chosen ? (
        <p className="m-0">
          {ui("where")} <strong>{zoneOf(chosen, places.zones)}</strong>
        </p>
      ) : (
        <>
          <Label htmlFor="first-plant-location">{ui("where")}</Label>
          <Select
            id="first-plant-location"
            value={chosen?.id ?? ""}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {places.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {zoneOf(l, places.zones)}
              </option>
            ))}
          </Select>
        </>
      )}
      {chosen && chosen.lightZoneId === null && (
        <ZoneChoice name={chosen.name} zones={places.zones} value={zoneId} onChange={setZoneId} />
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {ui("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => props.onDone()}>
          {ui("later")}
        </Button>
      </div>
    </section>
  );
}
