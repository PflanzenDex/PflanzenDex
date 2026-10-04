import type { ReactNode } from "react";
import type { LightLocation, LightZone } from "@pflanzendex/core";

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
 * One field of the profile: the catalog value on the left and my deviation on the right (US-BES-09), with the
 * reset to the catalog next to it. A field without deviation has nothing to reset.
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
    <div className="profile-row">
      <p className="quiet">{`Katalog: ${props.catalog}`}</p>
      <div className="profile-control">{props.children}</div>
      <button
        type="button"
        className="secondary"
        disabled={!props.hasOwn || props.busy}
        aria-label={`Auf Katalog zurücksetzen: ${props.label} (${props.species})`}
        onClick={props.onReset}
      >
        Auf Katalog zurücksetzen
      </button>
    </div>
  );
}

/** A choice among the account's own items (locations, zones), never typed (FR-PHA-03). */
export function Choice(props: {
  label: string;
  value: string;
  items: readonly (LightLocation | LightZone)[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Katalog gilt</option>
        {props.items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Month and day of one end of the dormancy period as two selects (no typing, no impossible dates by format). */
export function MonthDay(props: {
  label: string;
  species: string;
  month: string;
  day: string;
  onMonth: (v: string) => void;
  onDay: (v: string) => void;
}) {
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  return (
    <div className="profile-pair">
      <label>
        {`${props.label} (Monat) für „${props.species}“`}
        <select value={props.month} onChange={(e) => props.onMonth(e.target.value)}>
          <option value="">Monat</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        {`${props.label} (Tag) für „${props.species}“`}
        <select value={props.day} onChange={(e) => props.onDay(e.target.value)}>
          <option value="">Tag</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
