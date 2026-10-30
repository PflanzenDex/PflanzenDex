import * as React from "react";
import { Select, type SelectProps } from "../../../select/select";

const MONTHS = [
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

/** `YYYY-MM` as "Oktober 2026". */
export const monthText = (ym: string): string => {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

/** The current month `YYYY-MM` in the user's local calendar, never from UTC (NFR-08). */
export function localMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shift(ym: string, back: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) - back;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * Month picker with German month names (US-QS-24): a select of the last `count` months up to `max`
 * (default the current month), newest first. The value is `YYYY-MM`; a value outside the range stays selectable.
 */
const MonthField = React.forwardRef<
  HTMLSelectElement,
  Omit<SelectProps, "children" | "max" | "min"> & { max?: string; count?: number }
>(({ max = localMonth(), count = 36, value, ...props }, ref) => {
  const months = Array.from({ length: count }, (_, i) => shift(max, i));
  const current = value === undefined ? undefined : String(value);
  if (current && !months.includes(current)) months.push(current);
  return (
    <Select ref={ref} value={value} {...props}>
      {months.map((ym) => (
        <option key={ym} value={ym}>
          {monthText(ym)}
        </option>
      ))}
    </Select>
  );
});
MonthField.displayName = "MonthField";

export { MonthField };
