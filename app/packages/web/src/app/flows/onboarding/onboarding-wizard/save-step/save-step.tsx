import { useEffect, useState, type ReactNode } from "react";
import {
  speciesDisplayName,
  zoneDerive,
  type LightZone,
  type Species,
  zoneLabel,
} from "@pflanzendex/core";
import { Form } from "@/shared/ui/fields/form/form";
import { Select } from "@/shared/ui/fields/select/select";
import { Label } from "@/shared/ui/display/label/label";
import { MarkerFields, type FurtherMarker } from "@/collection";
import { createWrite, useQueryClient, type QueryClient } from "../../../../../shared/data";
import { refreshLight, sharedZones } from "../../../../../light";
import { ensureHome } from "../where-question/where-question";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./save-step.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/** The own zones; a new account has none yet, so the standard lamps are laid out silently first (US-ONB-02 gives them from the start). */
async function ownZones(
  client: QueryClient,
  api: string,
  token: Token,
): Promise<readonly LightZone[]> {
  const t = await token();
  if (!t) return [];
  const first = await sharedZones(client, api, t);
  if (!first.ok) return [];
  if (first.value.length > 0) {
    await ensureHome(client, api, t);
    return first.value;
  }
  const made = await createWrite(api, t)("POST", "/light-zones/defaults", {});
  if (!made.ok) return [];
  // The new zones refresh the shared light data (issue 1244); the default location "Zuhause" comes with them (US-ONB-02).
  await refreshLight(client);
  await ensureHome(client, api, t);
  const again = await sharedZones(client, api, t);
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
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || zones !== null) return;
    let current = true;
    void ownZones(client, api, token).then((z) => current && setZones(z));
    return () => {
      current = false;
    };
  }, [api, token, enabled, zones, client]);
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
  /** The marker of a further plant: shown for an owned species or after a refused marker (US-BES-03, US-QS-15). */
  marker?: FurtherMarker["fields"];
  /** More fields of the step, e.g. the suggested place of a further plant. */
  children?: ReactNode;
}) {
  const { species, zones } = props;
  const derived = zones ? derivedZone(species, zones) : null;
  return (
    <section className="flex flex-col gap-3">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        {ui("title")}
      </h2>
      <p className="m-0">
        <i>{species.latinName}</i>
        {species.germanName ? ` (${species.germanName})` : ""}
      </p>
      {props.marker && (
        <Form {...props.marker.form}>
          <MarkerFields
            control={props.marker.form.control}
            speciesName={speciesDisplayName(species)}
            required={props.marker.required}
            missing={props.marker.missing}
          />
        </Form>
      )}
      <Label htmlFor="first-plant-zone">{ui("zoneLabel")}</Label>
      <Select
        id="first-plant-zone"
        value={props.zoneId}
        disabled={zones === null}
        onChange={(e) => props.onZone(e.target.value)}
      >
        <option value="">
          {derived ? ui("derived", { name: zoneLabel(derived.name) }) : ui("unknown")}
        </option>
        {(zones ?? []).map((z) => (
          <option key={z.id} value={z.id}>
            {zoneLabel(z.name)}
          </option>
        ))}
      </Select>
      <p className="m-0 text-sm text-muted-foreground">{ui("hint")}</p>
      {props.children}
      {props.error && <p role="alert">{props.error}</p>}
    </section>
  );
}
