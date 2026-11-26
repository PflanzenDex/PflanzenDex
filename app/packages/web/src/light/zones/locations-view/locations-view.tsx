import { useId } from "react";
import { Form, FormRoot } from "@/shared/ui/form";
import type { ApiError, LightLocation, LightZone } from "../../shared/light-api/light-api";
import {
  FORM_GRID,
  RefusalAlert,
  SaveBar,
  SelectField,
  useSaveForm,
} from "../../shared/ui/form/form";
import { TextField } from "@/shared/ui/input";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import {
  LOCATION_REFUSABLE,
  NAME_MAX,
  locationSchema,
  toLocationInput,
  type LocationFields,
} from "../../shared/schemas";
import { zoneLabel } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../light.de.json";

const ui = texts(table);

export interface LocationInput {
  name: string;
  lightZoneId: string | null;
  kind: "indoor" | "outdoor";
}

/** `clearNote` removes the form's refusal: a key conflict of a new location carries a dismiss that calls it (US-QS-03). */
type Save = (e: LocationInput, clearNote: () => void) => Promise<ApiError | null>;

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
    save: (f, clearNote) => props.onSave(toLocationInput(f), clearNote),
    refusable: LOCATION_REFUSABLE,
    clear: !s,
  });
  const { control } = sent.form;
  const formId = useId();
  // Typed input that is not saved asks before the layer of the location closes (US-QS-32).
  useUnsavedInput(sent.form.formState.isDirty);
  return (
    <Form {...sent.form}>
      <FormRoot
        id={formId}
        className={FORM_GRID}
        onSubmit={sent.send}
        aria-label={s ? ui("location.editLabel", { name: s.name }) : ui("location.createLabel")}
      >
        <TextField
          control={control}
          name="name"
          label={ui("location.name")}
          maxLength={NAME_MAX}
          autoComplete="off"
        />
        <SelectField
          control={control}
          name="lightZoneId"
          label={ui("location.zone")}
          description={ui("location.zoneHint")}
        >
          <option value="">{ui("location.zoneNone")}</option>
          {props.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {zoneLabel(z.name)}
            </option>
          ))}
        </SelectField>
        <SelectField control={control} name="kind" label={ui("location.kind")}>
          <option value="indoor">{ui("location.indoor")}</option>
          <option value="outdoor">{ui("location.outdoor")}</option>
        </SelectField>
        <RefusalAlert sent={sent} />
        <SaveBar
          formId={formId}
          label={s ? ui("location.save") : ui("location.createLabel")}
          running={sent.running}
          onCancel={props.onCancel}
        />
      </FormRoot>
    </Form>
  );
}
