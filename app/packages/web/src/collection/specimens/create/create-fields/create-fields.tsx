import { useWatch, type Control } from "react-hook-form";
import { specimenName, type Species, type LightLocation, type LightZone } from "@pflanzendex/core";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Select } from "@/components/ui/fields/select/select";
import { CatchDateField } from "../../../markers/catch-date/catch-date-field/catch-date-field";
import { TITLE } from "../../cards/parts/parts";
import type { CreateFields } from "../../model/schemas";

/** The own light zone of the specimen, chosen from the own zones (US-LIC-02); empty = derived (P-08). */
function ZoneField(props: {
  control: Control<CreateFields>;
  zones: { items: readonly LightZone[]; failed: boolean };
}) {
  return (
    <FormField
      control={props.control}
      name="lightZoneId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Eigene Lichtzone</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">Aus Standort und Art ableiten</option>
              {props.zones.items.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormDescription>
            {props.zones.failed
              ? "Die Lichtzonen konnten nicht geladen werden. Du kannst die Zone später setzen."
              : "Ohne Auswahl wird die Zone abgeleitet."}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function OtherFields(props: {
  control: Control<CreateFields>;
  locations: readonly LightLocation[];
  zones: { items: readonly LightZone[]; failed: boolean };
  today: string;
}) {
  return (
    <>
      <FormField
        control={props.control}
        name="cutting"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Checkbox
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              >
                Das ist ein Steckling
              </Checkbox>
            </FormControl>
            <FormDescription>
              Ein Steckling steht unter Stecklingslicht und fehlt in den Phasen und in der
              Lichtverteilung. Wenn du ihn eintopfst, tippe auf der Karte „Eingetopft“.
            </FormDescription>
          </FormItem>
        )}
      />
      <FormField
        control={props.control}
        name="locationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Standort</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">Standort noch unbekannt</option>
                {props.locations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <ZoneField control={props.control} zones={props.zones} />
      <CatchDateField control={props.control} today={props.today} />
    </>
  );
}

export function Heading({ species }: { species: Species }) {
  return (
    <>
      <h1 id="create-title" className={TITLE}>
        Exemplar anlegen
      </h1>
      <p className="mb-5 text-muted-foreground">
        Art: <i>{species.latinName}</i>
        {species.germanName ? ` (${species.germanName})` : ""}
      </p>
    </>
  );
}

/** The name as it will be saved, updated while the keeper types the marker (DM-BES-03). */
export function NamePreview(props: { control: Control<CreateFields>; speciesName: string }) {
  const marker = useWatch({ control: props.control, name: "marker" });
  return (
    <p
      className="m-0 break-words rounded-lg border border-border px-3.5 py-3 font-semibold"
      aria-live="polite"
    >
      Name: {specimenName(props.speciesName, marker.trim() || null)}
    </p>
  );
}
