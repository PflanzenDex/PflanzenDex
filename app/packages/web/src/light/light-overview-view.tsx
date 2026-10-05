import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/shared/responsive-table";
import type { LightOverview, LightOverviewRow } from "./light-api";

const lux = new Intl.NumberFormat("de-DE");

const COLUMNS: ResponsiveColumn<LightOverviewRow>[] = [
  { key: "species", header: "Art", cell: (r) => r.speciesName },
  { key: "zone", header: "Lichtzone", cell: (r) => (r.zone ? r.zone.name : "unbekannt") },
  {
    key: "lux",
    header: "Lux-Bedarf",
    cell: (r) => <span className="tabular-nums">{lux.format(r.lightDemandLux)}</span>,
  },
  { key: "position", header: "Position", cell: (r) => r.position.description },
];

// US-LIC-03: species by light hunger with position recommendations
export function LightOverviewView(props: { data: LightOverview; onOpenCollection: () => void }) {
  const { data, onOpenCollection } = props;
  return (
    <section aria-labelledby="overview" className="flex min-w-0 flex-col gap-3">
      <h2 id="overview" className="text-xl font-semibold">
        Lichthunger
      </h2>
      {data.rows.length === 0 ? (
        <EmptyState
          title="Noch keine Arten mit aktivem Exemplar und gesetztem Lux-Bedarf"
          description="Lege ein Exemplar an oder aktualisiere den Lux-Bedarf einer Art."
          action={{ label: "Zum Bestand", onClick: onOpenCollection }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Arten sortiert nach Lux-Bedarf mit Positionsempfehlung. Höher = näher zur Lampe nötig.
          </p>
          <ResponsiveTable
            caption="Lichthunger der Arten"
            columns={COLUMNS}
            rows={[...data.rows]}
            getRowKey={(r) => r.speciesId}
          />
        </>
      )}
    </section>
  );
}
