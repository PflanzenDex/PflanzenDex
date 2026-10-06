import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormRoot } from "@/components/ui/form";
import type { ApiError, LightLocation, LightZone } from "./light-api";
import { FORM_GRID, FormButtons, RefusalAlert, SelectField, useSaveForm } from "./form";
import { TextField } from "@/components/ui/input";
import {
  LOCATION_REFUSABLE,
  NAME_MAX,
  locationSchema,
  toLocationInput,
  type LocationFields,
} from "./schemas";
import { ENTRY } from "./zones-view";
import { kindText, zoneName } from "./texts";

export interface LocationInput {
  name: string;
  lightZoneId: string | null;
  kind: "indoor" | "outdoor";
}

type Save = (e: LocationInput) => Promise<ApiError | null>;

export function LocationForm(props: {
  zones: readonly LightZone[];
  start?: LightLocation;
  onSave: Save;
  onCancel?: () => void;
}) {
  const s = props.start;
  const sent = useSaveForm<LocationFields>({
    schema: locationSchema,
    defaults: { name: s?.name ?? "", lightZoneId: s?.lightZoneId ?? "", kind: s?.kind ?? "indoor" },
    save: (f) => props.onSave(toLocationInput(f)),
    refusable: LOCATION_REFUSABLE,
    clear: !s,
  });
  const { control } = sent.form;
  return (
    <Form {...sent.form}>
      <FormRoot
        className={FORM_GRID}
        onSubmit={sent.send}
        aria-label={s ? `${s.name} ändern` : "Standort anlegen"}
      >
        <TextField
          control={control}
          name="name"
          label="Name"
          maxLength={NAME_MAX}
          autoComplete="off"
        />
        <SelectField control={control} name="lightZoneId" label="Lichtzone">
          <option value="">Keine Lichtzone (erscheint in den Hinweisen)</option>
          {props.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </SelectField>
        <SelectField control={control} name="kind" label="Art">
          <option value="indoor">innen</option>
          <option value="outdoor">außen</option>
        </SelectField>
        <RefusalAlert sent={sent} />
        <FormButtons
          label={s ? "Speichern" : "Standort anlegen"}
          running={sent.running}
          onCancel={props.onCancel}
        />
      </FormRoot>
    </Form>
  );
}

export function LocationCard(props: {
  location: LightLocation;
  zones: readonly LightZone[];
  onUpdate: Save;
}) {
  const { location } = props;
  const [update, setUpdate] = useState(false);
  const zone = zoneName(props.zones, location.lightZoneId);
  if (update)
    return (
      <li className={ENTRY}>
        <LocationForm
          zones={props.zones}
          start={location}
          onCancel={() => setUpdate(false)}
          onSave={async (e) => {
            const f = await props.onUpdate(e);
            if (!f) setUpdate(false);
            return f;
          }}
        />
      </li>
    );
  return (
    <li className={ENTRY}>
      <h3 className="text-lg font-semibold">{location.name}</h3>
      <p className="text-sm text-muted-foreground">
        {zone ?? "Keine Lichtzone"} · {kindText(location.kind)}
      </p>
      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <Button type="button" variant="secondary" onClick={() => setUpdate(true)}>
          {zone ? "Ändern" : "Lichtzone zuweisen"}
        </Button>
      </div>
    </li>
  );
}
