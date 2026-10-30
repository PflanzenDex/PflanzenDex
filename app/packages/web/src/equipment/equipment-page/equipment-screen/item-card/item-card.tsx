import type { EquipmentRow } from "../../../equipment-api";
import { useFeature } from "../../../../kernel";
import { STATUS_LABELS, TYPE_LABELS } from "../../../labels";
import { Maintenance, type MaintenanceActions } from "../../parts/maintenance/maintenance";
import { Supply, type SupplyActions } from "../../parts/supply/supply";
import { Sharing, type SharingActions } from "../../parts/sharing/sharing";

const UNKNOWN = "unbekannt";

/** One record: what is missing reads "unbekannt", never a guess (P-08). */
export function ItemCard(props: {
  item: EquipmentRow;
  zone: string | undefined;
  maintenance: MaintenanceActions;
  supply: SupplyActions;
  sharing: SharingActions;
}) {
  const { item, zone } = props;
  const social = useFeature("social");
  const maker = [item.manufacturer, item.model].filter(Boolean).join(" ");
  const price =
    item.priceEur === null ? UNKNOWN : `${item.priceEur.toFixed(2).replace(".", ",")} €`;
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <h3 className="break-words font-semibold">{item.name}</h3>
      <p className="text-sm text-muted-foreground">
        {TYPE_LABELS[item.type]}
        {item.status ? ` · ${STATUS_LABELS[item.status]}` : ""}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>Hersteller und Modell</dt>
        <dd className="m-0">{maker || UNKNOWN}</dd>
        <dt>Produkt-ID</dt>
        <dd className="m-0 break-all">{item.productId ?? UNKNOWN}</dd>
        {item.type === "Lamp" ? (
          <>
            <dt>Lichtzone</dt>
            <dd className="m-0">{zone ?? "ohne Zone"}</dd>
          </>
        ) : null}
        <dt>Preis</dt>
        <dd className="m-0">{price}</dd>
        <dt>Gekauft am</dt>
        <dd className="m-0">{item.boughtAt ?? UNKNOWN}</dd>
      </dl>
      {item.note ? <p className="mt-2 break-words text-sm">{item.note}</p> : null}
      <Supply item={item} actions={props.supply} />
      <Maintenance item={item} actions={props.maintenance} />
      {social && <Sharing item={item} actions={props.sharing} />}
    </div>
  );
}
