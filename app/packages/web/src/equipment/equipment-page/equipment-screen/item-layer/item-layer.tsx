import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { zoneLabel } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { withUnit } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import type { EquipmentData, EquipmentRow } from "../../../equipment-api";
import {
  DEFECTIVE_STATUS,
  LAMP_TYPE,
  POT_TYPE,
  RETIRED_STATUS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../../../labels";
import table from "../../../equipment.de.json";
import type { useLampActions } from "../../lamp-actions/lamp-actions";
import { ItemCard } from "../item-card/item-card";

const ITEM_PREFIX = "item-";
const t = texts(table);

/**
 * The trailing badge of a record (US-QS-32, SG-COLOR-04, SG-LIST-03): only a defect has one, the amber warning. A retirement
 * leads the meta line instead (see ItemRow), as plain muted text, so no badge can squeeze the name at a large text size;
 * "Aktiv" is the normal state and shows nothing.
 */
function defectBadge(status: EquipmentRow["status"]) {
  if (status === DEFECTIVE_STATUS)
    return <Badge variant="warning">{STATUS_LABELS.defective}</Badge>;
  return undefined;
}

/**
 * One record as an object row (name, kind, zone or pot size, state); the full record opens as a layer (US-QS-22, US-QS-32,
 * FX-35 step 5). Items have no photo: the drawn placeholder stands in the thumbnail. A retirement leads the meta line
 * ("Ausgemustert · Lampe · …"), so it is never the part that truncates (P-10); a defect is the row's one trailing badge.
 */
export function ItemRow(props: { item: EquipmentRow; zone: string | undefined }) {
  const { item, zone } = props;
  const sheet = ITEM_PREFIX + item.id;
  const { openLayer, open } = useLayer(sheet);
  const facts = [
    item.status === RETIRED_STATUS ? STATUS_LABELS.retired : null,
    TYPE_LABELS[item.type],
    item.type === LAMP_TYPE ? (zone ?? t("zone.missing")) : null,
    item.type === POT_TYPE
      ? item.diameterCm === null
        ? t("pot.sizeUnknown")
        : withUnit(item.diameterCm, "cm")
      : null,
  ].filter(Boolean);
  return (
    <ObjectRow
      id={`row-${sheet}`}
      title={item.name}
      meta={facts.join(" · ")}
      trailing={defectBadge(item.status)}
      haspopup="dialog"
      expanded={open}
      onClick={(e) => openLayer(e.currentTarget)}
    />
  );
}

/** The layer of the record named by `?sheet=item-<id>`; it exists only while that address is open. */
export function ItemLayer(props: {
  data: EquipmentData;
  lamps: ReturnType<typeof useLampActions>;
  /** The refusal of a write in this layer (P-10, F-0160). */
  outcome?: ReactNode;
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
      {props.outcome}
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
