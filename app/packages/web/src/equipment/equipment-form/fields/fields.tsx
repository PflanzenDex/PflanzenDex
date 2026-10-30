import { useWatch, type Control } from "react-hook-form";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES, zoneLabel } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
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
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              autoComplete="off"
              {...(props.max ? { maxLength: props.max } : {})}
              {...(props.inputMode ? { inputMode: props.inputMode } : {})}
            />
          </FormControl>
          {props.hint ? <FormDescription>{props.hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
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
        hint="Der Name ist einmalig. Bei mehreren gleichen Teilen hänge eine Unterscheidung an, zum Beispiel „ – Regal 2“."
      />
    </>
  );
}

export function OptionalFields({ control }: FieldProps) {
  return (
    <>
      <TextField
        control={control}
        name="manufacturer"
        label="Hersteller (optional)"
        max={EQUIPMENT_LIMITS.manufacturer.max}
      />
      <TextField
        control={control}
        name="model"
        label="Modell (optional)"
        max={EQUIPMENT_LIMITS.model.max}
      />
      <TextField
        control={control}
        name="productId"
        label="Produkt-ID (optional)"
        max={EQUIPMENT_LIMITS.productId.max}
        hint="GTIN/EAN oder Hersteller und Modell, keine Adresse."
      />
      <TextField
        control={control}
        name="priceEur"
        label="Preis in Euro (optional)"
        inputMode="decimal"
      />
      <FormField
        control={control}
        name="boughtAt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Kaufdatum (optional)</FormLabel>
            <FormControl>
              <Input {...field} type="date" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notiz (optional)</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} maxLength={EQUIPMENT_LIMITS.note.max} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
