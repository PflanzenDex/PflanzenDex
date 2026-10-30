import type { ReactNode } from "react";
import { classificationRules, zoneLabel } from "@pflanzendex/core";
import { Pager, LAYER_PARAM } from "@/components/shared/responsive/pager/pager";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/shared/responsive/responsive-table/responsive-table";
import type { LightZone } from "../../shared/light-api/light-api";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";

const number = new Intl.NumberFormat("de-DE");
const H2 = "text-xl font-semibold";
const H3 = "text-base font-semibold";
const LIST = "m-0 flex flex-col gap-2 pl-5";

const COLUMNS: ResponsiveColumn<LightZone>[] = [
  { key: "name", header: "Zone", cell: (z) => zoneLabel(z.name) },
  {
    key: "lux",
    header: "Lux-Obergrenze",
    cell: (z) => <span className="tabular-nums">{number.format(z.luxCeiling)}</span>,
  },
  {
    key: "ppfd",
    header: "PPFD",
    cell: (z) => (z.ppfd === null ? "unbekannt" : number.format(z.ppfd)),
  },
];

// US-LIC-04: reference on levels, indicators and warning signs. The collection table is the overview above (US-LIC-03).
// Three parts, one per page (US-QS-19): the zone table, the indicators and the warning signs.
export function RulesView({ zones }: { zones: readonly LightZone[] }) {
  const rules = classificationRules();
  const sorted = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);
  const { promoteFromPercent, stayBelowGapPercent } = rules.thresholds;
  const parts: ReactNode[] = [
    <div key="zones" className="flex min-w-0 flex-col gap-3">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Deine Stufentabelle erscheint hier, sobald du unten Lichtzonen übernommen oder angelegt
          hast.
        </p>
      ) : (
        <ResponsiveTable
          caption="Deine Lichtzonen"
          columns={COLUMNS}
          rows={sorted}
          getRowKey={(z) => z.id}
        />
      )}
      <MoreHelp
        more={`Eine Art steigt auf, wenn ihr Bedarf mindestens ${promoteFromPercent}\u00a0% der Lux-Obergrenze ihrer Zone erreicht; liegt er mehr als ${stayBelowGapPercent}\u00a0% unter der Obergrenze der nächsten Zone, bleibt sie, denn mehr Licht bringt dann Stress.`}
      >
        Die niedrigste Zone ist Stecklingslicht und nie Ziel für erwachsene Pflanzen.
      </MoreHelp>
    </div>,
    <div key="indicators" className="flex min-w-0 flex-col gap-3">
      <h3 className={H3}>Indikatoren für höhere Stufen</h3>
      <ul className={LIST}>
        {rules.indicators.map((i) => (
          <li key={i.key}>{i.text}</li>
        ))}
      </ul>
    </div>,
    <div key="warnings" className="flex min-w-0 flex-col gap-3">
      <h3 className={H3}>Warnzeichen</h3>
      <ul className={LIST}>
        {rules.warnings.map((w) => (
          <li key={w.key}>
            {w.sign}. {w.action}
          </li>
        ))}
      </ul>
    </div>,
  ];
  return (
    <section aria-labelledby="rules" className="flex min-w-0 flex-col gap-3">
      <h2 id="rules" className={H2}>
        Einstufungsregeln
      </h2>
      <Pager
        items={parts}
        pageSize={1}
        label="Teile der Einstufungsregeln"
        param={LAYER_PARAM}
        getKey={(_, i) => i}
        renderItem={(part) => part}
      />
    </section>
  );
}
