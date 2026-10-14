import type { ZoneStore } from "../../light";
import type { WishStore, ZoneStockSource } from "../../wishlist";
import { zoneEquipment } from "../lamps/zones";
import type { EquipmentRow, EquipmentStore } from "../store/types";

export type NeedKind = "supply_low" | "zone_without_lamp" | "wish_without_lamp" | "no_replacement";

/** One thing that is missing: why (reason and source in the keeper's own data) and what to do next (P-09). */
export interface Need {
  /** Stable per cause (`supply:<id>`, `zone:<id>`, `wish-zone:<zone>`, `replace:<id>`), so lists can be compared. */
  readonly id: string;
  readonly kind: NeedKind;
  readonly reason: string;
  /** Where the reason comes from, in the keeper's words. */
  readonly source: string;
  readonly nextAction: string;
}

export interface NeedsDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
  readonly zones: Pick<ZoneStore, "list">;
  readonly stock: Pick<ZoneStockSource, "stock">;
  readonly wishes: Pick<WishStore, "open">;
}

const SUPPLY_WORD = { low: "wird knapp", empty: "ist leer" } as const;

function supplyNeeds(items: readonly EquipmentRow[]): Need[] {
  return items.flatMap((e): Need[] =>
    e.supply === "low" || e.supply === "empty"
      ? [
          {
            id: `supply:${e.id}`,
            kind: "supply_low",
            reason: `„${e.name}“ ${SUPPLY_WORD[e.supply]}.`,
            source: "Vorrat unter Equipment",
            nextAction: "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“.",
          },
        ]
      : [],
  );
}

/** A broken device needs a replacement when no other active device of the same type (for a lamp: of the same zone) works. */
function replacementNeeds(items: readonly EquipmentRow[]): Need[] {
  const covered = (e: EquipmentRow) =>
    items.some(
      (o) =>
        o.id !== e.id &&
        o.type === e.type &&
        o.status === "active" &&
        (e.type !== "Lamp" || o.lightZoneId === e.lightZoneId),
    );
  return items
    .filter((e) => (e.status === "defective" || e.status === "retired") && !covered(e))
    .map((e) => ({
      id: `replace:${e.id}`,
      kind: "no_replacement" as const,
      reason: `„${e.name}“ ist ${e.status === "defective" ? "defekt" : "ausgemustert"} und kein anderes aktives Gerät übernimmt.`,
      source: "Zustand unter Equipment",
      nextAction: "Repariere das Gerät, erfasse ein Ersatzgerät oder wünsche dir eines.",
    }));
}

/**
 * "Missing / Rebuy" (US-EQU-07), purely derived on every request from the keeper's own data (P-01, NFR-04): a consumable
 * that is low or empty, a zone 2 to 4 with specimens but no active lamp, a wish whose target zone has no active lamp and
 * a broken device without replacement. Every item names reason, source and next action (P-09) and says nothing about
 * urgency or price (P-08). No recommendation arises here (stage 2).
 */
export async function equipmentNeeds(deps: NeedsDependencies, userId: string): Promise<Need[]> {
  const [items, zoneView, zones, wishes] = await Promise.all([
    deps.equipment.list(userId),
    zoneEquipment(deps, userId),
    deps.zones.list(userId),
    deps.wishes.open(userId),
  ]);
  const zoneNeeds = zoneView.zones.flatMap((z): Need[] =>
    z.note?.kind === "no_active_lamp"
      ? [
          {
            id: `zone:${z.zoneId}`,
            kind: "zone_without_lamp",
            reason: z.note.text,
            source: "Pflanzen je Lichtzone",
            nextAction: z.note.nextAction,
          },
        ]
      : [],
  );
  const lit = new Set(
    items
      .filter((e) => e.type === "Lamp" && e.status === "active" && e.lightZoneId !== null)
      .map((e) => e.lightZoneId),
  );
  const wished = new Map<string, number>();
  for (const w of wishes)
    if (w.targetZoneId !== null && !lit.has(w.targetZoneId))
      wished.set(w.targetZoneId, (wished.get(w.targetZoneId) ?? 0) + 1);
  const wishNeeds = zones.flatMap((z): Need[] => {
    const n = wished.get(z.id);
    return n
      ? [
          {
            id: `wish-zone:${z.id}`,
            kind: "wish_without_lamp",
            reason: `${n === 1 ? "Ein Wunsch zielt" : `${n} Wünsche zielen`} auf die Lichtzone ${z.name}, die keine aktive Lampe hat.`,
            source: "Wunschliste",
            nextAction: "Erfasse eine Lampe für diese Zone, bevor die Pflanze einzieht.",
          },
        ]
      : [];
  });
  return [...supplyNeeds(items), ...zoneNeeds, ...wishNeeds, ...replacementNeeds(items)];
}
