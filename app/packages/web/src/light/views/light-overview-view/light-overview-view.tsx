import { EmptyState } from "@/components/shared/empty-state/empty-state";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/shared/responsive/responsive-table/responsive-table";
import type { LightOverview, LightOverviewRow } from "../../shared/light-api/light-api";
import { zoneLabel } from "@pflanzendex/core";

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
          title="Noch keine Arten mit aktiver Pflanze und gesetztem Lux-Bedarf"
          description="Lege eine Pflanze an oder aktualisiere den Lux-Bedarf einer Art."
          action={{ label: "Zur Sammlung", onClick: onOpenCollection }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Arten nach Lux-Bedarf sortiert; höher heißt näher an die Lampe.
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
