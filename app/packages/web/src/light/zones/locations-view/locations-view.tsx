import { Form, FormRoot } from "@/components/ui/fields/form/form";
import type { ApiError, LightLocation, LightZone } from "../../shared/light-api/light-api";
import {
  FORM_GRID,
  FormButtons,
  RefusalAlert,
  SelectField,
  useSaveForm,
} from "../../shared/ui/form/form";
import { TextField } from "@/components/ui/fields/input/input";
import {
  LOCATION_REFUSABLE,
  NAME_MAX,
  locationSchema,
  toLocationInput,
  type LocationFields,
} from "../../shared/schemas";
import { zoneLabel } from "@pflanzendex/core";

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
              {zoneLabel(z.name)}
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
