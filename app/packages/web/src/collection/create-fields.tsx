import { useWatch, type Control } from "react-hook-form";
import { specimenName, type Species, type LightLocation } from "@pflanzendex/core";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { CatchDateField } from "./catch-date-field";
import { TITLE } from "./parts";
import type { CreateFields } from "./schemas";

export function OtherFields(props: {
  control: Control<CreateFields>;
  locations: readonly LightLocation[];
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
            <FormDescription>Ohne Auswahl bleibt der Standort unbekannt.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
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
