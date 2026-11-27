import type { Control } from "react-hook-form";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/ui/form";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { texts } from "@/shared/lib/text-rules/texts";
import { Row } from "./care-profile-row/care-profile-row";
import table from "./care-profile-fields.de.json";
import type { CareProfileFields as Fields } from "../../../specimens/model/schemas";

export { Row };

const t = texts(table);

export const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** `MM-DD` as the German short date "01.11." */
export const dayText = (tag: string) => `${tag.slice(3, 5)}.${tag.slice(0, 2)}.`;

/**
 * One field of the profile: the catalog value above and my deviation below (US-BES-09), with the reset to the
 * catalog next to it. A field without deviation has nothing to reset. The visible label names the field only; the
 * accessible name adds the species, because the heading of the card names it (US-QS-32, SG-FORM-01).
 */

type Key = keyof Fields;

/** A choice among the account's own items (locations, zones), never typed (FR-PHA-03). */
export function Choice(props: {
  control: Control<Fields>;
  name: Key;
  label: string;
  species: string;
  items: readonly (LightLocation | LightZone)[];
  /** Keeps the element, so the next step of an unknown light need can move the focus to it (US-LIC-01). */
  selectRef?: { current: HTMLSelectElement | null };
}) {
  return (
    <Field control={props.control} name={props.name} label={props.label}>
      {(field) => (
        <Select
          {...field}
          aria-label={t("forSpecies", { label: props.label, species: props.species })}
          ref={(element) => {
            field.ref(element);
            if (props.selectRef) props.selectRef.current = element;
          }}
        >
          <option value="">{t("catalogWord")}</option>
          {props.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Watering interval in days (1 to 365); empty means no deviation. */
export function DaysInput(props: {
  control: Control<Fields>;
  name: Key;
  label: string;
  species: string;
}) {
  const visible = t("daysLabel", { label: props.label });
  return (
    <Field control={props.control} name={props.name} label={visible}>
      {(field) => (
        <Input
          {...field}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          aria-label={t("forSpecies", { label: visible, species: props.species })}
        />
      )}
    </Field>
  );
}

/** Own free-text hints (DM-BES-04). */
export function HintsInput(props: { control: Control<Fields>; label: string; species: string }) {
  return (
    <FormField
      control={props.control}
      name="ownHints"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              rows={3}
              maxLength={1000}
              aria-label={t("forSpecies", { label: props.label, species: props.species })}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
