import { useEffect, useState, type ReactNode } from "react";
import { zoneDerive, type LightZone, type Species, zoneLabel } from "@pflanzendex/core";
import { Select } from "@/components/ui/fields/select/select";
import { Label } from "@/components/ui/display/label/label";
import { createWrite } from "../../../kernel";
import { loadZones } from "../../../light";
import { ensureHome } from "../where-question/where-question";

type Token = () => Promise<string | undefined>;

/** The own zones; a new account has none yet, so the standard lamps are laid out silently first (US-ONB-02 gives them from the start). */
async function ownZones(api: string, token: Token): Promise<readonly LightZone[]> {
  const t = await token();
  if (!t) return [];
  const first = await loadZones(api, t);
  if (!first.ok) return [];
  if (first.value.length > 0) {
    await ensureHome(api, t);
    return first.value;
  }
  const made = await createWrite(api, t)("POST", "/light-zones/defaults", {});
  if (!made.ok) return [];
  // The default location "Zuhause" comes with the default lamps (US-ONB-02).
  await ensureHome(api, t);
  const again = await loadZones(api, t);
  return again.ok ? again.value : [];
}

/** The zone the species needs, derived live from its light demand (FR-BES-10); `null` = unknown (P-08). */
export const derivedZone = (species: Species, zones: readonly LightZone[]): LightZone | null => {
  const d = zoneDerive(
    {
      lightDemandLux: species.lightDemandLux,
      standardLevel: species.standardLevel,
      softLeaf: species.softLeaf,
    },
    zones,
  );
  return d.kind === "zone" ? d.zone : null;
};

/** Light zones of the account for the save step; `zones` is `null` while they load. */
export function useOwnZones(api: string, token: Token, enabled: boolean) {
  const [zones, setZones] = useState<readonly LightZone[] | null>(null);
  useEffect(() => {
    if (!enabled || zones !== null) return;
    let current = true;
    void ownZones(api, token).then((z) => current && setZones(z));
    return () => {
      current = false;
    };
  }, [api, token, enabled, zones]);
  return zones;
}

/**
 * Step 2 of the first plant (US-ONB-01): the light need is prefilled from the species as a value to change, never as
 * a question. Empty value = derived, so nothing derived is stored (P-01).
 */
export function SaveStep(props: {
  species: Species;
  zones: readonly LightZone[] | null;
  /** Empty = the zone derived from the species. */
  zoneId: string;
  onZone: (id: string) => void;
  error: string | null;
  /** More fields of the step, e.g. the suggested place of a further plant. */
  children?: ReactNode;
}) {
  const { species, zones } = props;
  const derived = zones ? derivedZone(species, zones) : null;
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        Pflanze speichern
      </h2>
      <p className="m-0">
        <i>{species.latinName}</i>
        {species.germanName ? ` (${species.germanName})` : ""}
      </p>
      <Label htmlFor="first-plant-zone">Lichtbedarf</Label>
      <Select
        id="first-plant-zone"
        value={props.zoneId}
        disabled={zones === null}
        onChange={(e) => props.onZone(e.target.value)}
      >
        <option value="">
          {derived ? `${derived.name} (laut Art)` : "Unbekannt, die Art nennt keinen Wert"}
        </option>
        {(zones ?? []).map((z) => (
          <option key={z.id} value={z.id}>
            {zoneLabel(z.name)}
          </option>
        ))}
      </Select>
      <p className="m-0 text-sm text-muted-foreground">
        Der Lichtbedarf kommt von der Art. Du kannst ihn ändern.
      </p>
      {props.children}
      {props.error && <p role="alert">{props.error}</p>}
    </section>
  );
}
