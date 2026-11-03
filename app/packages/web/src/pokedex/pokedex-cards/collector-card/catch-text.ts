import type { CatchDate } from "@pflanzendex/core";

/** `2026-03-05` becomes `05.03.2026`; a calendar date is never run through `Date` (NFR-08). */
const germanDate = (date: string) => date.split("-").reverse().join(".");

/** "gefangen 05.03.2026", "gefangen ≈ 05.03.2026" (creation date) or "Datum unbekannt" (US-POK-07, P-08). */
export function catchText(d: CatchDate): string {
  if (d.date === null) return "Datum unbekannt";
  return `gefangen ${d.source === "created_at" ? "≈ " : ""}${germanDate(d.date)}`;
}
