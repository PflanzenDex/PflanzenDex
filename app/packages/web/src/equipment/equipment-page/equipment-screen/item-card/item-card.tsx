import type { EquipmentRow } from "../../../equipment-api";
import { useFeature } from "../../../../kernel";
import { STATUS_LABELS, TYPE_LABELS } from "../../../labels";
import { Maintenance, type MaintenanceActions } from "../../parts/maintenance/maintenance";
import { Supply, type SupplyActions } from "../../parts/supply/supply";
import { Sharing, type SharingActions } from "../../parts/sharing/sharing";

function Fact(props: { label: string; value: string }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd className="m-0 break-all">{props.value}</dd>
    </>
  );
}

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
  const price = item.priceEur === null ? null : `${item.priceEur.toFixed(2).replace(".", ",")} €`;
  // Known values are rows; what is unknown is folded into one line (P-08), until the shared fold (#1030).
  const all: [string, string | null | undefined][] = [
    ["Hersteller und Modell", maker || null],
    ["Produkt-ID", item.productId],
    ...(item.type === "Lamp" ? ([["Lichtzone", zone ?? "ohne Zone"]] as [string, string][]) : []),
    ["Preis", price],
    ["Gekauft am", item.boughtAt],
  ];
  const facts = all.filter(([, v]) => v) as [string, string][];
  const unknown = all.filter(([, v]) => !v).map(([l]) => l);
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <h3 className="break-words font-semibold">{item.name}</h3>
      <p className="text-sm text-muted-foreground">
        {TYPE_LABELS[item.type]}
        {item.status ? ` · ${STATUS_LABELS[item.status]}` : ""}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </dl>
      {unknown.length > 0 ? (
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Noch unbekannt: {unknown.join(", ")}
        </p>
      ) : null}
      {item.note ? <p className="mt-2 break-words text-sm">{item.note}</p> : null}
      <Supply item={item} actions={props.supply} />
      <Maintenance item={item} actions={props.maintenance} />
      {social && <Sharing item={item} actions={props.sharing} />}
    </div>
  );
}
