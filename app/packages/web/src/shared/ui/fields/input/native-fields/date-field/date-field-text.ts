// The text of a typed date field and what it means (pure calendar arithmetic, no time zone, NFR-08).

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Is `y-m-d` a real calendar day? */
function isRealDay(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "09.03.2026" or "2026-03-09" as the local calendar date `YYYY-MM-DD`; `""` when it is no real day (NFR-08). */
export function parseDateText(text: string): string {
  const trimmed = text.trim();
  const iso = ISO.exec(trimmed);
  const de = GERMAN.exec(trimmed);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : de
      ? [Number(de[3]), Number(de[2]), Number(de[1])]
      : [0, 0, 0];
  if (!y || !isRealDay(y, m, d)) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` as "09.03.2026"; anything else is shown as it is. */
export function showDateText(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * What the field hands on for a text: the calendar date `YYYY-MM-DD`, or the text as typed when it is no real day (the
 * form refuses it, US-QS-32), or `""` for an empty field.
 */
export function handedFor(text: string): string {
  return parseDateText(text) || (text.trim() === "" ? "" : text);
}

/** While the parent's value is what the draft already hands on, keep the draft (the user is typing). */
export function draftFor(draft: string, value: string): string {
  return handedFor(draft) === value ? draft : showDateText(value);
}
