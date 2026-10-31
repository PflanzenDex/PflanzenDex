import { useEffect, useState } from "react";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { loadCards } from "../../../collection";
import { loadLocations, loadZones } from "../../../light";
import { cuttingLight, zoneLabel } from "@pflanzendex/core";

type Token = () => Promise<string | undefined>;

interface Places {
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
  /** The place of the last plant, offered as a suggestion; `""` = none known (P-08). */
  readonly suggested: string;
}

/** The own places and the one the last plant stands at (by its name on the card); nothing is read when it fails. */
async function loadPlaces(api: string, token: Token): Promise<Places | null> {
  const t = await token();
  if (!t) return null;
  const [l, z, c] = await Promise.all([
    loadLocations(api, t),
    loadZones(api, t),
    loadCards(api, t),
  ]);
  if (!l.ok || !z.ok) return null;
  const last = c.ok
    ? [...c.value]
        .filter((k) => k.location !== null)
        .sort((a, b) => (a.caughtAt ?? "").localeCompare(b.caughtAt ?? ""))
        .at(-1)
    : undefined;
  // A place under cutting light is no suggestion for a plant that is not a cutting (issue 1045, US-BES-04).
  const cutting = cuttingLight(z.value);
  const place = l.value.find((x) => x.name === last?.location);
  const suggested = place && place.lightZoneId !== cutting?.id ? place.id : "";
  return { locations: l.value, zones: z.value, suggested };
}

/** The place with the light it stands under, so the choice shows what it brings with it (P-10). */
const label = (l: LightLocation, zones: readonly LightZone[]) => {
  const z = zones.find((x) => x.id === l.lightZoneId);
  return z ? `${l.name} (${zoneLabel(z.name)})` : l.name;
};

/** The own places for the flow of a further plant; `places` is `null` while they load or when they are not readable. */
export function usePlaces(api: string, token: Token, onSuggest: (id: string) => void) {
  const [places, setPlaces] = useState<Places | null>(null);
  useEffect(() => {
    let current = true;
    void loadPlaces(api, token).then((p) => {
      if (!current || !p) return;
      setPlaces(p);
      onSuggest(p.suggested);
    });
    return () => {
      current = false;
    };
  }, [api, token, onSuggest]);
  return places;
}

/** "Standort": the last plant's place is preselected and shown with its light; "Keiner" leaves it open. Nothing is stored unseen. */
export function PlaceField(props: {
  places: Places | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const { places } = props;
  if (!places || places.locations.length === 0) return null;
  return (
    <>
      <Label htmlFor="add-plant-place">Standort</Label>
      <Select
        id="add-plant-place"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">Keiner</option>
        {places.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {label(l, places.zones)}
          </option>
        ))}
      </Select>
    </>
  );
}
