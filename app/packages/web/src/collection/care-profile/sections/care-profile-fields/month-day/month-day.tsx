import { useFormContext, useWatch, type Control } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/ui/form";
import { Select } from "@/shared/ui/select";
import { texts } from "@/shared/lib/text-rules/texts";
import { MONTHS } from "../care-profile-fields";
import table from "../care-profile-fields.de.json";
import type { CareProfileFields as Fields } from "../../../../specimens/model/schemas";

const t = texts(table);
type Key = keyof Fields;

/** Days of each month in a yearly range: February has 29, a rest period may end on the 29th (US-BES-09). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_OPTIONS = MONTHS.map((text, i) => ({ value: String(i + 1), text }));
const DAY_NUMBERS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/** The days a chosen month has; no month chosen offers all 31 (the yearly range starts anywhere). */
const daysOf = (month: string): number => DAYS_IN_MONTH[Number(month) - 1] ?? 31;

/** The month of one end of the rest period. A day past the end of the new month moves to its last day, visibly. */
function MonthSelect(props: { control: Control<Fields>; name: Key; day: Key; accessible: string }) {
  const { getValues, setValue } = useFormContext<Fields>();
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{t("month")}</FormLabel>
          <FormControl>
            <Select
              {...field}
              aria-label={props.accessible}
              onChange={(e) => {
                field.onChange(e);
                const limit = daysOf(e.target.value);
                if (Number(getValues(props.day)) > limit)
                  setValue(props.day, String(limit), { shouldDirty: true });
              }}
            >
              <option value="">{t("month")}</option>
              {MONTH_OPTIONS.map((o) => (
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

/** The day of one end of the rest period: only the days of the chosen month are offered. */
function DaySelect(props: { control: Control<Fields>; name: Key; month: Key; accessible: string }) {
  const chosen = useWatch({ control: props.control, name: props.month });
  const days = DAY_NUMBERS.slice(0, daysOf(chosen));
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{t("day")}</FormLabel>
          <FormControl>
            <Select {...field} aria-label={props.accessible}>
              <option value="">{t("day")}</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
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

/**
 * One end of the rest period, "von" or "bis" (US-BES-09, US-QS-32, SG-CTRL-03): a month and a day side by side. The
 * accessible names keep the species, the visible labels do not (the heading of the card names it).
 */
export function MonthDay(props: {
  control: Control<Fields>;
  when: "from" | "until";
  species: string;
  month: Key;
  day: Key;
}) {
  const accessible = (part: string) =>
    t("restPart", { when: t(props.when), part, species: props.species });
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="text-sm font-medium">{t(props.when)}</legend>
      <div className="grid grid-cols-2 gap-2">
        <MonthSelect
          control={props.control}
          name={props.month}
          day={props.day}
          accessible={accessible(t("month"))}
        />
        <DaySelect
          control={props.control}
          name={props.day}
          month={props.month}
          accessible={accessible(t("day"))}
        />
      </div>
    </fieldset>
  );
}
