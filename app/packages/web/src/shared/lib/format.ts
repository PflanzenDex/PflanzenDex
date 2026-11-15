import { daysBetween } from "@pflanzendex/core";
import { NBSP } from "./text-rules/texts";

export { NBSP };

/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";

/** `YYYY-MM-DD` as "03.10.2026" (without time zone conversion: it is a calendar date, NFR-08). */
export function dateText(iso: string): string {
  const [jahr, month, tag] = iso.split("-");
  return `${tag}.${month}.${jahr}`;
}

/** Up to this many days back or ahead a date reads relative in a summary line (SG-FMT-01). */
const RELATIVE_DAYS = 7;

/** The relative phrase of `iso` seen from `today` (both `YYYY-MM-DD`), or `null` beyond 7 days: calendar days, no zone. */
function relativeDay(iso: string, today: string): string | null {
  const days = daysBetween(today, iso);
  if (Math.abs(days) > RELATIVE_DAYS) return null;
  if (days === 0) return "heute";
  if (days === -1) return "gestern";
  if (days === 1) return "morgen";
  return days < 0 ? `vor ${-days}${NBSP}Tagen` : `in ${days}${NBSP}Tagen`;
}

/**
 * A date in a summary line ("Stand: gestern", "Zuletzt geprüft heute"; SG-FMT-01): relative up to 7 days back or ahead,
 * else "TT.MM.JJJJ". `iso` and `today` are calendar dates of the keeper's zone (core `localToday`, `currentTimeZone()`).
 */
export function summaryDate(iso: string, today: string): string {
  return relativeDay(iso, today) ?? dateText(iso);
}

/**
 * A date in a phrase that reads "am <date>" (SG-FMT-01): "Gesund vor 6 Tagen" within 7 days, "Gesund am 01.10.2026"
 * beyond. The relative word replaces "am", so "am heute" never appears.
 */
export function onDate(iso: string, today: string): string {
  return relativeDay(iso, today) ?? `am ${dateText(iso)}`;
}

/** "12,5 cm": the growth measures of the species are measured in centimetres (US-WAC-01). */
export const valueText = (value: number): string =>
  `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}${NBSP}cm`;

const UNITS =
  "Tagen|Tage|Tag|Wochen|Woche|Monaten|Monate|Monat|Jahren|Jahre|Jahr|Stunden|Minuten|cm|Lux|lx|kB|MB|%";
const NUMBER_UNIT = new RegExp(`(\\d(?:[\\d.,]*\\d)?) (${UNITS})(?![\\p{L}])`, "gu");
const DATE_RANGE = /(\d{2}\.\d{2}\.\d{4}) (–|-|bis) (\d{2}\.\d{2}\.\d{4})/g;

/** A zone or lamp name and its number: "Zone 2", "Lampe 2", "Zone 1 (Stecklingslicht)" (US-QS-32). */
const ZONE_NUMBER = /\b(Zone|Lampe) (\d+)\b/g;

/**
 * Number and unit, the two ends of a date range and a zone name with its number never break apart (US-QS-15, US-QS-18,
 * US-QS-24, US-QS-32): "10 Tage", "12,5 cm", "30.000 Lux", "03.10.2026 – 05.10.2026" and "Zone 2" get non-breaking spaces.
 */
export const keepTogether = (text: string): string =>
  text
    .replace(NUMBER_UNIT, `$1${NBSP}$2`)
    .replace(DATE_RANGE, `$1${NBSP}$2${NBSP}$3`)
    .replace(ZONE_NUMBER, `$1${NBSP}$2`);

/** A number with its unit as one unbreakable piece: `withUnit(30000, "Lux")` is "30.000 Lux" (US-QS-24). */
export const withUnit = (value: number, unit: string): string =>
  `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}${NBSP}${unit}`;

const OVERDUE_SINCE = /überfällig seit (\d+) (?:Tag(?:en)?|Tg\.)/;

/** "10 Tage überfällig" for a text that says "überfällig seit 10 Tagen" (US-QS-18); `null` when it does not say so. */
export function overdueChip(text: string): string | null {
  const m = OVERDUE_SINCE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return `${n}${NBSP}${n === 1 ? "Tag" : "Tage"} überfällig`;
}

/** The text without the "überfällig seit N Tagen" part the chip already says (US-QS-18). */
export const withoutOverdue = (text: string): string =>
  text
    .replace(/\s*[–-]\s*überfällig seit \d+ (?:Tag(?:en)?|Tg\.)/, "")
    .replace(/\s+überfällig seit \d+ (?:Tag(?:en)?|Tg\.)/, "");
