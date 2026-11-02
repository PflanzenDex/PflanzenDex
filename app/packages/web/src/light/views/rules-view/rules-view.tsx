import type { ReactNode } from "react";
import { classificationRules, zoneLabel } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/shared/responsive/responsive-table/responsive-table";
import type { LightZone } from "../../shared/light-api/light-api";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { useIsMd } from "@/lib/use-breakpoint";

/** The entries cut into pages of `size` (a page is one part of the rules). */
const pagesOf = <T,>(entries: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(entries.length / size) }, (_, i) =>
    entries.slice(i * size, (i + 1) * size),
  );

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
/** The parts of the rules, one per page: the zone table, the help with the indicators, the warning signs (US-QS-19). */
function rulePartsFor(zones: readonly LightZone[], size: number): ReactNode[] {
  const rules = classificationRules();
  const sorted = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);
  const { promoteFromPercent, stayBelowGapPercent } = rules.thresholds;
  const zonePages: ReactNode[] =
    sorted.length === 0
      ? [
          <p key="empty" className="text-sm text-muted-foreground">
            Deine Stufentabelle erscheint hier, sobald du unten Lichtzonen übernommen oder angelegt
            hast.
          </p>,
        ]
      : pagesOf(sorted, size).map((page, i) => (
          <ResponsiveTable
            key={`zones-${i}`}
            caption="Deine Lichtzonen"
            columns={COLUMNS}
            rows={page}
            getRowKey={(z) => z.id}
          />
        ));
  const warningPages = pagesOf(rules.warnings, size);
  return [
    ...zonePages,
    <div key="indicators" className="flex min-w-0 flex-col gap-3">
      <MoreHelp
        more={`Eine Art steigt auf, wenn ihr Bedarf mindestens ${promoteFromPercent}\u00a0% der Lux-Obergrenze ihrer Zone erreicht; liegt er mehr als ${stayBelowGapPercent}\u00a0% unter der Obergrenze der nächsten Zone, bleibt sie, denn mehr Licht bringt dann Stress.`}
      >
        Die niedrigste Zone ist Stecklingslicht und nie Ziel für erwachsene Pflanzen.
      </MoreHelp>
      <h3 className={H3}>Indikatoren für höhere Stufen</h3>
      <ul className={LIST}>
        {rules.indicators.map((i) => (
          <li key={i.key}>{i.text}</li>
        ))}
      </ul>
    </div>,
    ...warningPages.map((page, i) => (
      <div key={`warnings-${i}`} className="flex min-w-0 flex-col gap-3">
        <h3 className={H3}>Warnzeichen</h3>
        <ul className={LIST}>
          {page.map((w) => (
            <li key={w.key}>
              {w.sign}. {w.action}
            </li>
          ))}
        </ul>
      </div>
    )),
  ];
}

export function RulesView({ zones }: { zones: readonly LightZone[] }) {
  const md = useIsMd();
  // Phones: two zones and two warning signs a page, so each page fits a layer at 360 x 640 (US-QS-19).
  const parts = rulePartsFor(zones, md ? 6 : 2);
  return (
    <section aria-labelledby="rules" className="flex min-w-0 flex-col gap-3">
      <h2 id="rules" className={H2}>
        Einstufungsregeln
      </h2>
      <Pager
        items={parts}
        pageSize={1}
        label="Teile der Einstufungsregeln"
        param="rpage"
        getKey={(_, i) => i}
        renderItem={(part) => part}
      />
    </section>
  );
}
