import { useWatch, type Control } from "react-hook-form";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES, zoneLabel } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { DateField } from "@/shared/ui/input.date-field";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { TYPE_LABELS } from "../../labels";
import type { EquipmentFields } from "../../schemas";

type FieldProps = { control: Control<EquipmentFields> };

function TextField(props: {
  control: Control<EquipmentFields>;
  name: "name" | "manufacturer" | "model" | "productId" | "priceEur";
  label: string;
  max?: number;
  hint?: string;
  inputMode?: "decimal";
  optional?: boolean;
  suffix?: string;
}) {
  return (
    <Field
      control={props.control}
      name={props.name}
      label={props.label}
      description={props.hint}
      optional={props.optional}
      suffix={props.suffix}
    >
      {(field) => (
        <Input
          {...field}
          autoComplete="off"
          {...(props.max ? { maxLength: props.max } : {})}
          {...(props.inputMode ? { inputMode: props.inputMode } : {})}
        />
      )}
    </Field>
  );
}

/** A lamp belongs to exactly one light zone, chosen from the list (US-EQU-02); no other type has one. */
export function ZoneField(props: {
  control: Control<EquipmentFields>;
  zones: readonly { zoneId: string; name: string }[];
}) {
  const type = useWatch({ control: props.control, name: "type" });
  if (type !== "Lamp") return null;
  return (
    <FormField
      control={props.control}
      name="lightZoneId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Lichtzone</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">Bitte wählen</option>
              {props.zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>
                  {zoneLabel(z.name)}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormDescription>
            Ohne Lichtzonen lege zuerst unter „Standorte verwalten“ die Zonen an.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function RequiredFields({ control }: FieldProps) {
  return (
    <>
      <FormField
        control={control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Art</FormLabel>
            <FormControl>
              <Select {...field}>
                <option value="">Bitte wählen</option>
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <TextField
        control={control}
        name="name"
        label="Name"
        max={EQUIPMENT_LIMITS.name.max}
        hint="Der Name ist einmalig. Bei mehreren gleichen Geräten hänge eine Unterscheidung an, zum Beispiel „ – Regal 2“."
      />
    </>
  );
}

/** The fields behind "Mehr Angaben"; one of them holding a value or a refusal opens the group (US-QS-24, issue 1032). */
export const OPTIONAL_FIELDS = [
  "manufacturer",
  "model",
  "productId",
  "priceEur",
  "boughtAt",
  "note",
] as const satisfies readonly (keyof EquipmentFields)[];

export function OptionalFields({ control }: FieldProps) {
  return (
    <>
      <TextField
        control={control}
        name="manufacturer"
        label="Hersteller"
        optional
        max={EQUIPMENT_LIMITS.manufacturer.max}
      />
      <TextField
        control={control}
        name="model"
        label="Modell"
        optional
        max={EQUIPMENT_LIMITS.model.max}
      />
      <TextField
        control={control}
        name="productId"
        label="Produkt-ID"
        optional
        max={EQUIPMENT_LIMITS.productId.max}
        hint="GTIN/EAN oder Hersteller und Modell, keine Adresse."
      />
      <TextField
        control={control}
        name="priceEur"
        label="Preis"
        optional
        suffix="€"
        inputMode="decimal"
      />
      <Field control={control} name="boughtAt" label="Kaufdatum" optional>
        {(field) => <DateField {...field} />}
      </Field>
      <Field control={control} name="note" label="Notiz" optional>
        {(field) => <Textarea {...field} rows={3} maxLength={EQUIPMENT_LIMITS.note.max} />}
      </Field>
    </>
  );
}
