import { equipmentCosts, type CostLine, type EquipmentRow } from "@pflanzendex/core";
import { TYPE_LABELS } from "../../labels";

const UNKNOWN = "unbekannt";
const euro = (sum: number | null) =>
  sum === null ? UNKNOWN : `${sum.toFixed(2).replace(".", ",")} €`;
const coverage = (l: CostLine) => `${l.priced} von ${l.count}`;

/**
 * The costs (US-EQU-09): the sum of the acquisition costs per type and in total, only over the records with a price, and
 * for how many records the price is missing. Where no price is known it reads "unbekannt", never 0 (P-08). Computed from
 * the keeper's own records on every render (P-01); no estimate of electricity or replacement costs.
 */
export function CostsView(props: { items: readonly EquipmentRow[] }) {
  const view = equipmentCosts(props.items);
  if (props.items.length === 0) return null;
  return (
    <section aria-labelledby="equipment-costs-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-costs-title" className="text-xl font-semibold">
        Kosten
      </h2>
      <p className="m-0">
        <span className="text-2xl font-semibold">{euro(view.total.sumEur)}</span>{" "}
        <span className="text-muted-foreground">{view.coverage}</span>
      </p>
      <ul
        className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Kosten je Art"
      >
        {view.byType.map((l) => (
          <li key={l.type} className="min-w-0 rounded-lg border border-border p-3">
            <p className="m-0 font-semibold">{TYPE_LABELS[l.type]}</p>
            <p className="m-0">{euro(l.sumEur)}</p>
            <p className="m-0 text-sm text-muted-foreground">Preis bekannt bei {coverage(l)}</p>
          </li>
        ))}
      </ul>
      {view.nextAction ? <p className="m-0 text-sm">{view.nextAction}</p> : null}
      <p className="m-0 text-sm text-muted-foreground">{view.note}</p>
    </section>
  );
}
