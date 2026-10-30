import { EmptyState } from "@/components/shared/empty-state/empty-state";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/shared/responsive/responsive-table/responsive-table";
import type { LightOverview, LightOverviewRow } from "../../shared/light-api/light-api";
import { zoneLabel } from "@pflanzendex/core";
import { Pager, LAYER_PARAM } from "@/components/shared/responsive/pager/pager";
import { useIsMd } from "@/lib/use-breakpoint";

/** Rows per page of the overview (starting values, assumption): one on a phone, six from 768 px (US-QS-19). */
const rowsPerPage = (md: boolean) => (md ? 6 : 1);
/** The rows cut into pages; each page is one table. */
const pagesOf = <T,>(rows: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

const lux = new Intl.NumberFormat("de-DE");

const COLUMNS: ResponsiveColumn<LightOverviewRow>[] = [
  { key: "species", header: "Art", cell: (r) => r.speciesName },
  {
    key: "zone",
    header: "Lichtzone",
    cell: (r) => (r.zone ? zoneLabel(r.zone.name) : "unbekannt"),
  },
  {
    key: "lux",
    header: "Lux-Bedarf",
    cell: (r) =>
      r.lightDemandLux === null ? (
        "unbekannt"
      ) : (
        <span className="tabular-nums">{lux.format(r.lightDemandLux)}</span>
      ),
  },
  {
    key: "position",
    header: "Position",
    // P-08/P-09: without a known lux need there is no position; the next step says how to get one.
    cell: (r) =>
      r.position?.description ??
      "Lichtbedarf eintragen: Lichtzone im Pflegeprofil der Art festlegen",
  },
];

// US-LIC-03: species by light hunger with position recommendations
export function LightOverviewView(props: { data: LightOverview; onOpenCollection: () => void }) {
  const { data, onOpenCollection } = props;
  const md = useIsMd();
  return (
    <section aria-labelledby="overview" className="flex min-w-0 flex-col gap-3">
      <h2 id="overview" className="text-xl font-semibold">
        Lichthunger
      </h2>
      {data.rows.length === 0 ? (
        <EmptyState
          title="Noch keine Arten mit aktiver Pflanze"
          description="Lege eine Pflanze an, dann erscheint ihre Art hier."
          action={{ label: "Zur Sammlung", onClick: onOpenCollection }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Arten nach Lux-Bedarf sortiert; höher heißt näher an die Lampe. Arten mit unbekanntem
            Lux-Bedarf stehen am Ende.
          </p>
          <Pager
            items={pagesOf(data.rows, rowsPerPage(md))}
            pageSize={1}
            label="Seiten der Lichthunger-Tabelle"
            param={LAYER_PARAM}
            getKey={(_, i) => i}
            renderItem={(page) => (
              <ResponsiveTable
                caption="Lichthunger der Arten"
                columns={COLUMNS}
                rows={page}
                getRowKey={(r) => r.speciesId}
              />
            )}
          />
        </>
      )}
    </section>
  );
}
