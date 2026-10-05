import { classificationRules } from "@pflanzendex/core";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/shared/responsive-table";
import type { LightZone } from "../light-api";

const number = new Intl.NumberFormat("de-DE");
const H2 = "text-xl font-semibold";
const H3 = "text-base font-semibold";
const LIST = "m-0 flex flex-col gap-2 pl-5";

const COLUMNS: ResponsiveColumn<LightZone>[] = [
  { key: "name", header: "Zone", cell: (z) => z.name },
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
export function RulesView({ zones }: { zones: readonly LightZone[] }) {
  const rules = classificationRules();
  const sorted = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);
  const { promoteFromPercent, stayBelowGapPercent } = rules.thresholds;
  return (
    <section aria-labelledby="rules" className="flex min-w-0 flex-col gap-3">
      <h2 id="rules" className={H2}>
        Einstufungsregeln
      </h2>
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
      <p className="text-sm text-muted-foreground">
        Die niedrigste Zone ist Stecklingslicht und nie Ziel für erwachsene Pflanzen. Eine Art
        steigt auf, wenn ihr Bedarf mindestens {promoteFromPercent} % der Lux-Obergrenze ihrer Zone
        erreicht; liegt er mehr als {stayBelowGapPercent} % unter der Obergrenze der nächsten Zone,
        bleibt sie, denn mehr Licht bringt dann Stress.
      </p>
      <h3 className={H3}>Indikatoren für höhere Stufen</h3>
      <ul className={LIST}>
        {rules.indicators.map((i) => (
          <li key={i.key}>{i.text}</li>
        ))}
      </ul>
      <h3 className={H3}>Warnzeichen</h3>
      <ul className={LIST}>
        {rules.warnings.map((w) => (
          <li key={w.key}>
            {w.sign}. {w.action}
          </li>
        ))}
      </ul>
    </section>
  );
}
