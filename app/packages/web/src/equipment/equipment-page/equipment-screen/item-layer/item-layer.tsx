import { useSearchParams } from "react-router";
import { zoneLabel } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import type { EquipmentData, EquipmentRow } from "../../../equipment-api";
import { STATUS_LABELS, TYPE_LABELS } from "../../../labels";
import type { useLampActions } from "../../lamp-actions/lamp-actions";
import { ItemCard } from "../item-card/item-card";

const ITEM_PREFIX = "item-";

/** One record as a row (name, kind, state, zone); the full record opens as a layer (US-QS-22). */
export function ItemRow(props: { item: EquipmentRow; zone: string | undefined }) {
  const { item, zone } = props;
  const { openLayer } = useLayer(ITEM_PREFIX + item.id);
  const facts = [
    TYPE_LABELS[item.type],
    item.status ? STATUS_LABELS[item.status] : null,
    item.type === "Lamp" ? (zone ?? "ohne Zone") : null,
  ].filter(Boolean);
  return (
    <Button
      type="button"
      variant="outline"
      aria-haspopup="dialog"
      onClick={(e) => openLayer(e.currentTarget)}
      className="h-auto w-full flex-col items-start gap-0 whitespace-normal px-3 py-2 text-left"
    >
      <span className="break-words font-semibold">{item.name}</span>
      <span className="text-sm font-normal text-muted-foreground">{facts.join(" · ")}</span>
    </Button>
  );
}

/** The layer of the record named by `?sheet=item-<id>`; it exists only while that address is open. */
export function ItemLayer(props: {
  data: EquipmentData;
  lamps: ReturnType<typeof useLampActions>;
}) {
  const sheet = useSearchParams()[0].get("sheet") ?? "";
  const item = sheet.startsWith(ITEM_PREFIX)
    ? props.data.items.find((i) => ITEM_PREFIX + i.id === sheet)
    : undefined;
  if (!item) return null;
  const zone = props.data.zones.zones.find((z) => z.zoneId === item.lightZoneId);
  const { lamps } = props;
  return (
    <LayerSheet id={sheet} title={item.name}>
      <ItemCard
        item={item}
        zone={zone ? zoneLabel(zone.name) : undefined}
        maintenance={lamps.maintenance}
        supply={lamps.supply}
        sharing={lamps.sharing}
      />
    </LayerSheet>
  );
}
