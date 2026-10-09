// Warning before the candidate list runs empty (US-WUN-02): derived on every request from the open wishes and the
// zones 2 to 4, never stored (P-01). Wishes without a zone 2 to 4 count towards no zone (FR-WUN-03).
import type { Replenishment } from "../types";
import type { WishRow, ZoneStock } from "../../types";

/**
 * Open candidates every zone 2 to 4 should have at least. Assumption, decided by the PO: a fixed starting value of 2
 * (the spec says "adjustable"; an account setting follows with its own change, the function takes it as a parameter).
 */
export const REPLENISH_BUFFER = 2;

const candidates = (n: number): string =>
  `${n} ${n === 1 ? "offener Kandidat" : "offene Kandidaten"}`;

/** The zones below the buffer, each with the warning text; `nextAction` is `null` while nothing is missing. */
export function replenishment(
  open: readonly WishRow[],
  zones: readonly ZoneStock[],
  buffer: number = REPLENISH_BUFFER,
): Replenishment {
  const low = zones
    .map((z) => ({ z, n: open.filter((w) => w.targetZoneId === z.zoneId).length }))
    .filter(({ n }) => n < buffer)
    .map(({ z, n }) => ({
      zoneId: z.zoneId,
      name: z.name,
      open: n,
      text: `Nachschub nötig: ${z.name} (${candidates(n)})`,
    }));
  return {
    buffer,
    zones: low,
    // "Discover for <zone>" (US-ENT-07) and "Fetch suggestions" (US-WUN-04) do not exist yet: not offered, so the
    // keeper is pointed to the form that does (P-09).
    actions: { discover: false, suggestions: false },
    nextAction:
      low.length === 0
        ? null
        : `Erfasse einen Wunsch mit Ziel-Zone ${low.map((l) => l.name).join(" oder ")} (Formular „Wunsch erfassen“).`,
  };
}
