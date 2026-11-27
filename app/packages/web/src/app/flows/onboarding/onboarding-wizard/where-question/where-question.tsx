import { useState } from "react";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { errorText, refusalText } from "@/shared/lib/error-text";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { setSpecimenLocation } from "../../../../../collection";
import {
  createWrite,
  entityKey,
  useQueryClient,
  type QueryClient,
  useRepeatKey,
} from "../../../../../shared/data";
import { refreshLight } from "../../../../../light";
import { zoneLabel } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { usePlaces, type Places } from "./use-places";
import table from "./where-question.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/** The note after a save: the place and, when it has one, its light zone (P-10). */
const savedText = (name: string, zone: LightZone | undefined) =>
  ui("saved", { name, zone: zone ? `, ${zoneLabel(zone.name)}` : "" });

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
  target: { zoneId: string; keys: ReturnType<typeof useRepeatKey> },
) {
  const { zoneId, keys } = target;
  const t = await p.token();
  if (!t) return { ok: false as const, error: { code: "access.not_signed_in" } };
  const set = await keys.run(
    (key) => setSpecimenLocation(p.api, t, { id: p.specimenId, locationId: chosen.id }, { key }),
    entityKey("specimen", p.specimenId, `locate:${chosen.id}`),
  );
  if (!set.ok || chosen.lightZoneId !== null || !zoneId) return set;
  const named = await keys.run(
    (key) =>
      createWrite(p.api, t, { key })("PUT", `/locations/${chosen.id}`, {
        name: chosen.name,
        kind: chosen.kind,
        lightZoneId: zoneId,
      }),
    entityKey("location", chosen.id, `zone:${zoneId}`),
  );
  // The location now stands under a light zone: the shared copies of the light data are asked again (issue 1244).
  if (named.ok) await refreshLight(client);
  return named;
}

type WhereProps = {
  api: string;
  token: Token;
  specimenId: string;
  /** `note` says what was saved (P-10); without it nothing was changed. */
  onDone: (note?: string) => void;
  /** Moves the focus to the heading of the step before a retry: the retry button leaves the screen (issue 2127). */
  focusHeading?: () => void;
};

/**
 * After the first plant is saved: one question at the plant, once (US-ONB-02). "Später" leaves the plant without a
 * place, which is no error; the collection shows it as "ohne Standort" with the way to set it. The question is a
 * hint, not a step. When the places cannot be read or made, the reason stands with "Erneut versuchen" and "Später"
 * (P-09, P-10, issue 2127).
 */
export function WhereQuestion(props: WhereProps) {
  const { places, error, retry } = usePlaces(props.api, props.token);
  // The retry button leaves the screen: the focus goes to the step's heading first (issue 2127).
  const again = () => {
    props.focusHeading?.();
    retry();
  };
  // usePlaces loads the places again by itself when the device is back online (issue 2127): `ownOffline` keeps
  // RequestState from loading them a second time (US-QS-32).
  if (error)
    return (
      <section className="flex flex-col gap-3">
        <RequestState status="error" errorText={refusalText(error)} onRetry={again} ownOffline />
        <Button type="button" variant="ghost" onClick={() => props.onDone()}>
          {ui("later")}
        </Button>
      </section>
    );
  if (!places || places.locations.length === 0) return null;
  return <PlaceChoice {...props} places={places} />;
}

/** The choice of the location and of its zone, and the save. Mounted once the places are there, so the choice survives a retry. */
function PlaceChoice(props: WhereProps & { places: Places }) {
  const { places } = props;
  const client = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = places.locations.find((l) => l.id === (locationId || places.locations[0]?.id));
  const keys = useRepeatKey();
  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    const r = await placeSpecimen(client, props, chosen, { zoneId, keys });
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
      <StepActions saving={saving} onSave={() => void save()} onLater={() => props.onDone()} />
    </section>
  );
}

/**
 * The actions of the step: "Sichern" writes the location (needs the network, US-ONB-02); "Später" writes nothing. The
 * reason stands once below both buttons.
 */
function StepActions(props: { saving: boolean; onSave: () => void; onLater: () => void }) {
  return (
    <NetworkSlot>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={props.saving} needsNetwork onClick={props.onSave}>
          {ui("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={props.onLater}>
          {ui("later")}
        </Button>
      </div>
    </NetworkSlot>
  );
}
