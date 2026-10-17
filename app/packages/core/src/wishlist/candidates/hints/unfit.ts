import type { OutsideZone, WishRow, ZoneStock } from "../../types";
import type { UnfitWish } from "../types";

/**
 * The open wishes that do not count in the space question (FR-WUN-03): no target zone, or a zone that is not among
 * zones 2 to 4 (the cutting light). Assumption, decided by the PO: each is listed with name, zone, a short reason and
 * the next action; nothing is removed or changed automatically (P-10) and no zone is invented (P-08).
 */
export function unfitWishes(
  open: readonly WishRow[],
  zones: readonly ZoneStock[],
  outside: readonly OutsideZone[],
  titleOf: (w: WishRow) => string,
): readonly UnfitWish[] {
  const counted = new Set(zones.map((z) => z.zoneId));
  return open
    .filter((w) => w.targetZoneId === null || !counted.has(w.targetZoneId))
    .map((w): UnfitWish => {
      const zone = outside.find((z) => z.zoneId === w.targetZoneId)?.name ?? null;
      return w.targetZoneId === null
        ? {
            id: w.id,
            title: titleOf(w),
            kind: "zone_unknown",
            zone: null,
            reason:
              "Für diesen Wunsch ist keine Ziel-Zone eingetragen, deshalb zählt er bei der Platzfrage nicht mit.",
            nextAction: NEXT,
          }
        : {
            id: w.id,
            title: titleOf(w),
            kind: "zone_outside",
            zone,
            reason: `${zone ? `„${zone}“ ist` : "Die Ziel-Zone ist"} das Stecklingslicht, kein Ziel für erwachsene Pflanzen (Zonen 2 bis 4): der Wunsch zählt bei der Platzfrage nicht mit.`,
            nextAction: NEXT,
          };
    });
}

const NEXT =
  "Zone prüfen: Lege den Wunsch mit einer Zone 2 bis 4 neu an, oder entscheide, ihn aus der Liste zu nehmen (Verwerfen; er bleibt unter „Verworfen“ gespeichert).";
