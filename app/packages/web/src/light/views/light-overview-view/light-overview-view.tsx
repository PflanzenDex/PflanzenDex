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
