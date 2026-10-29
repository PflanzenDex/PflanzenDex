/** P-08: what is missing is called "unknown" and is never filled with a value. */
export const UNKNOWN = "unbekannt";

/** `YYYY-MM-DD` as "03.10.2026" (without time zone conversion: it is a calendar date, NFR-08). */
export function dateText(iso: string): string {
  const [jahr, month, tag] = iso.split("-");
  return `${tag}.${month}.${jahr}`;
}

/** "12,5 cm": the growth measures of the species are measured in centimetres (US-WAC-01). */
export const valueText = (value: number): string =>
  `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;

const NBSP = " ";

/** Number and unit never break apart (US-QS-15, US-QS-18): "10 Tage" gets a non-breaking space. */
export const keepTogether = (text: string): string =>
  text.replace(/(\d+) (Tagen|Tage|Tag|Wochen|Woche|cm)(?![\p{L}])/gu, `$1${NBSP}$2`);

const OVERDUE_SINCE = /überfällig seit (\d+) Tag(?:en)?/;

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
    .replace(/\s*[–-]\s*überfällig seit \d+ Tag(?:en)?/, "")
    .replace(/\s+überfällig seit \d+ Tag(?:en)?/, "");
