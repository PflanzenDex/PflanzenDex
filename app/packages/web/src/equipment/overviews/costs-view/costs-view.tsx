import { equipmentCosts, type CostLine, type EquipmentRow } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { TYPE_LABELS } from "../../labels";

/** Kinds per page (starting value, assumption; the page size from the free height is #1029). */
const COSTS_PER_PAGE = 4;
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
      <h2 id="equipment-costs-title" className="sr-only">
        Kosten
      </h2>
      <p className="m-0">
        <span className="text-2xl font-semibold">{euro(view.total.sumEur)}</span>{" "}
        <span className="text-muted-foreground">{view.coverage}</span>
      </p>
      <Pager
        items={view.byType}
        pageSize={COSTS_PER_PAGE}
        label="Kosten je Art"
        param={LAYER_PARAM}
        getKey={(l) => l.type}
        listClassName="gap-0"
        renderItem={(l) => (
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-2">
            <span className="font-semibold">{TYPE_LABELS[l.type]}</span>
            <span>{euro(l.sumEur)}</span>
            <span className="w-full text-sm text-muted-foreground">
              Preis bekannt bei {coverage(l)}
            </span>
          </div>
        )}
      />
      {view.nextAction ? <p className="m-0 text-sm">{view.nextAction}</p> : null}
      <p className="m-0 text-sm text-muted-foreground">{view.note}</p>
    </section>
  );
}
