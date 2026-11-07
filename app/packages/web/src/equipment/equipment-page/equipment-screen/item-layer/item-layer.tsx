import { useSearchParams } from "react-router";
import { zoneLabel } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { withUnit } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import type { EquipmentData, EquipmentRow } from "../../../equipment-api";
import { LAMP_TYPE, POT_TYPE, STATUS_LABELS, TYPE_LABELS } from "../../../labels";
import table from "../../../equipment.de.json";
import type { useLampActions } from "../../lamp-actions/lamp-actions";
import { ItemCard } from "../item-card/item-card";

const ITEM_PREFIX = "item-";
const t = texts(table);

/** One record as a row (name, kind, state, zone or pot size); the full record opens as a layer (US-QS-22). */
export function ItemRow(props: { item: EquipmentRow; zone: string | undefined }) {
  const { item, zone } = props;
  const sheet = ITEM_PREFIX + item.id;
  const { openLayer } = useLayer(sheet);
  const facts = [
    TYPE_LABELS[item.type],
    item.status ? STATUS_LABELS[item.status] : null,
    item.type === LAMP_TYPE ? (zone ?? "ohne Zone") : null,
    item.type === POT_TYPE
      ? item.diameterCm === null
        ? t("pot.sizeUnknown")
        : withUnit(item.diameterCm, "cm")
      : null,
  ].filter(Boolean);
  return (
    <Button
      id={`row-${sheet}`}
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
