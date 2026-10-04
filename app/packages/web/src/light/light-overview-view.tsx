import type { LightOverview, LightOverviewRow } from "./light-api";

// US-LIC-03: species by light hunger with position recommendations
export function LightOverviewView(props: { data: LightOverview; onOpenCollection: () => void }) {
  const { data, onOpenCollection } = props;
  if (data.rows.length === 0) {
    return (
      <section aria-labelledby="overview">
        <h2 id="overview">Lichthunger</h2>
        <div className="empty">
          <p>
            Noch keine Arten mit aktivem Exemplar und gesetztem Lux-Bedarf. Lege ein Exemplar an
            oder aktualisiere den Lux-Bedarf einer Art.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={onOpenCollection}>
              Zum Bestand
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="overview">
      <h2 id="overview">Lichthunger</h2>
      <p className="quiet">
        Arten sortiert nach Lux-Bedarf mit Positionsempfehlung. Höher = näher zur Lampe nötig.
      </p>
      <table className="light-overview">
        <thead>
          <tr>
            <th>Art</th>
            <th>Lichtzone</th>
            <th>Lux-Bedarf</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <Row key={row.speciesId} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Row({ row }: { row: LightOverviewRow }) {
  const luxFormatted = new Intl.NumberFormat("de-DE").format(row.lightDemandLux);

  return (
    <tr>
      <td>{row.speciesName}</td>
      <td>{row.zone ? row.zone.name : "unbekannt"}</td>
      <td>{luxFormatted}</td>
      <td>{row.position.description}</td>
    </tr>
  );
}
