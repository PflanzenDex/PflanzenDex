import type { EquipmentRow } from "../../../equipment-api";
import { useFeature } from "../../../../shared/data";
import { dateText, withUnit } from "@/shared/lib/format";
import { metaParts } from "@/shared/lists/grouped-list/row-parts/row-parts.meta";
import { texts } from "@/shared/lib/text-rules/texts";
import { LAMP_TYPE, POT_TYPE, STATUS_LABELS, TYPE_LABELS } from "../../../labels";
import table from "../../../equipment.de.json";
import { Maintenance, type MaintenanceActions } from "../../parts/maintenance/maintenance";
import { Supply, type SupplyActions } from "../../parts/supply/supply";
import { Sharing, type SharingActions } from "../../parts/sharing/sharing";

const t = texts(table);

/** A fact is a label and a value; only a word longer than the column breaks (F-0228, US-QS-32). */
function Fact(props: { label: string; value: string }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd className="m-0 [overflow-wrap:break-word]">{props.value}</dd>
    </>
  );
}

/** The pot fields of a pot as rows: an unknown value reads "unbekannt" (P-08); no other type has them. */
function potRows(item: EquipmentRow): [string, string][] {
  if (item.type !== POT_TYPE) return [];
  const size = (value: number | null) =>
    value === null ? t("pot.unknown") : withUnit(value, "cm");
  const drainage =
    item.drainage === null
      ? t("pot.unknown")
      : item.drainage
        ? t("pot.drainageYes")
        : t("pot.drainageNo");
  return [
    [t("pot.diameter"), size(item.diameterCm)],
    [t("pot.height"), size(item.heightCm)],
    [t("pot.material"), item.material ?? t("pot.unknown")],
    [t("pot.drainage"), drainage],
  ];
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
  // The euro sign is the unit of the price: no break before it (US-QS-32, SG-TYPE-07).
  const price =
    item.priceEur === null ? null : `${item.priceEur.toFixed(2).replace(".", ",")}\u00a0€`;
  // Known values are rows; what is unknown is folded into one line (P-08), until the shared fold (#1030).
  const all: [string, string | null | undefined][] = [
    ["Hersteller und Modell", maker || null],
    ["Produkt-ID", item.productId],
    ...(item.type === LAMP_TYPE
      ? ([["Lichtzone", zone ?? t("zone.missing")]] as [string, string][])
      : []),
    ["Preis", price],
    ["Gekauft am", item.boughtAt ? dateText(item.boughtAt) : null],
  ];
  const facts = [...(all.filter(([, v]) => v) as [string, string][]), ...potRows(item)];
  const unknown = all.filter(([, v]) => !v).map(([l]) => l);
  return (
    // The facts stack, label over value, in a box narrower than 12 rem: at 200 % text the label column alone took the room
    // of the value (the same rule as FactGrid, F-0228 and F-0105, US-QS-32).
    <div className="@container min-w-0 rounded-lg border border-border p-3">
      <p className="text-sm text-muted-foreground">
        {metaParts(
          `${TYPE_LABELS[item.type]}${item.status ? ` · ${STATUS_LABELS[item.status]}` : ""}`,
        )}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm @min-[12rem]:grid-cols-[auto_minmax(0,1fr)]">
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </dl>
      {unknown.length > 0 ? (
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          {t("item.unknown", { list: unknown.join(", ") })}
        </p>
      ) : null}
      {item.note ? <p className="mt-2 break-words text-sm">{item.note}</p> : null}
      <Supply item={item} actions={props.supply} />
      <Maintenance item={item} actions={props.maintenance} />
      {social && <Sharing item={item} actions={props.sharing} />}
    </div>
  );
}
