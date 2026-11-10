import { equipmentCosts, type EquipmentRow } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../equipment.de.json";
import { TYPE_LABELS } from "../../labels";

const t = texts(table);

/** Kinds per page until the layout measures the free height of the layer (starting value, assumption; #1029, issue 1182). */
const COSTS_PER_PAGE = 4;
const euro = (sum: number | null) =>
  sum === null ? t("costs.unknown") : `${sum.toFixed(2).replace(".", ",")} €`;

/**
 * The costs (US-EQU-09): the sum of the acquisition costs per type and in total, only over the records with a price, and
 * for how many records the price is missing. Where no price is known it reads "unbekannt", never 0 (P-08). Computed from
 * the keeper's own records on every render (P-01); no estimate of electricity or replacement costs.
 */
export function CostsView(props: { items: readonly EquipmentRow[] }) {
  const view = equipmentCosts(props.items);
  if (props.items.length === 0) return null;
  return (
    <section
      aria-labelledby="equipment-costs-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="equipment-costs-title" className="sr-only">
        {t("costs.title")}
      </h2>
      <p className="m-0">
        <span className="text-2xl font-semibold">{euro(view.total.sumEur)}</span>{" "}
        <span className="text-muted-foreground">{view.coverage}</span>
      </p>
      <Pager
        items={view.byType}
        pageSize={COSTS_PER_PAGE}
        fit
        label={t("costs.list")}
        param={LAYER_PARAM}
        replace
        getKey={(l) => l.type}
        listClassName="gap-0"
        renderItem={(l) => (
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-2">
            <span className="font-semibold">{TYPE_LABELS[l.type]}</span>
            <span>{euro(l.sumEur)}</span>
            <span className="w-full text-sm text-muted-foreground">
              {t("costs.known", { priced: l.priced, count: l.count })}
            </span>
          </div>
        )}
      />
      {view.nextAction ? <p className="m-0 text-sm">{view.nextAction}</p> : null}
      <p className="m-0 text-sm text-muted-foreground">{view.note}</p>
    </section>
  );
}
