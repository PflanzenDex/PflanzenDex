import type { ReactNode } from "react";
import type { Control } from "react-hook-form";
import type { LightLocation, LightZone } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import { Quiet } from "./parts";
import type { CareProfileFields as Fields } from "./schemas";

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
 * catalog next to it. A field without deviation has nothing to reset.
 */
export function Row(props: {
  label: string;
  species: string;
  catalog: string;
  hasOwn: boolean;
  busy: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-t border-border py-3">
      <Quiet>{`Katalog: ${props.catalog}`}</Quiet>
      <div className="grid gap-2">{props.children}</div>
      <Button
        type="button"
        variant="outline"
        disabled={!props.hasOwn || props.busy}
        aria-label={`Auf Katalog zurücksetzen: ${props.label} (${props.species})`}
        onClick={props.onReset}
      >
        Auf Katalog zurücksetzen
      </Button>
    </div>
  );
}

type Key = keyof Fields;

/** A choice among the account's own items (locations, zones), never typed (FR-PHA-03). */
export function Choice(props: {
  control: Control<Fields>;
  name: Key;
  label: string;
  items: readonly (LightLocation | LightZone)[];
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">Katalog gilt</option>
              {props.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/** One select of the dormancy period: month or day, no typing, no impossible dates by format. */
function PartSelect(props: {
  control: Control<Fields>;
  name: Key;
  label: string;
  empty: string;
  options: readonly { value: string; text: string }[];
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">{props.empty}</option>
              {props.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const MONTH_OPTIONS = MONTHS.map((text, i) => ({ value: String(i + 1), text }));
const DAY_OPTIONS = DAYS.map((d) => ({ value: d, text: d }));

/** Month and day of one end of the dormancy period as two selects. */
export function MonthDay(props: {
  control: Control<Fields>;
  label: string;
  species: string;
  month: Key;
  day: Key;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <PartSelect
        control={props.control}
        name={props.month}
        label={`${props.label} (Monat) für „${props.species}“`}
        empty="Monat"
        options={MONTH_OPTIONS}
      />
      <PartSelect
        control={props.control}
        name={props.day}
        label={`${props.label} (Tag) für „${props.species}“`}
        empty="Tag"
        options={DAY_OPTIONS}
      />
    </div>
  );
}

/** Watering interval in days (1 to 365); empty means no deviation. */
export function DaysInput(props: { control: Control<Fields>; name: Key; label: string }) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input {...field} type="number" inputMode="numeric" min={1} max={365} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Own free-text hints (DM-BES-04). */
export function HintsInput(props: { control: Control<Fields>; label: string }) {
  return (
    <FormField
      control={props.control}
      name="ownHints"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Textarea {...field} rows={3} maxLength={1000} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
