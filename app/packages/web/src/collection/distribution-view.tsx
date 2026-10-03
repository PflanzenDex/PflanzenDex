import type { NotCounted, Distribution } from "@pflanzendex/core";

const specimens = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** What was not counted and why; nothing disappears silently (P-10). Empty if everything is counted. */
function notCounted(n: NotCounted): string | null {
  const share = [
    n.cuttingLight > 0 && `${n.cuttingLight} unter Stecklingslicht`,
    n.archived > 0 && `${n.archived} archiviert`,
    n.zoneUnknown > 0 && `${n.zoneUnknown} mit unbekannter Zone`,
  ].filter(Boolean);
  return share.length === 0 ? null : `Nicht mitgezählt: ${share.join(", ")}.`;
}

/**
 * Where there is still room (US-LIC-02): specimens per light zone 2 to 4, the thinnest zone (all with a tie) and what
 * to do next (P-09). Cutting light does not count; the numbers come from the API, nothing is calculated here.
 */
export function DistributionView({ distribution }: { distribution: Distribution }) {
  const thin = new Set(distribution.thinnest.map((z) => z.id));
  const highest = Math.max(1, ...distribution.zones.map((z) => z.count));
  const rest = notCounted(distribution.notCounted);
  return (
    <section aria-labelledby="distribution-title" className="distribution">
      <h2 id="distribution-title">Verteilung auf die Lichtzonen</h2>
      <p>{distribution.hint.text}</p>
      <p className="next-action">{distribution.hint.nextAction}</p>
      {distribution.zones.length > 0 && (
        <ul aria-label="Exemplare je Lichtzone" className="distribution-list">
          {distribution.zones.map(({ zone, count }) => (
            <li key={zone.id} className={thin.has(zone.id) ? "thinnest" : undefined}>
              <span>
                {zone.name}: {specimens(count)}
                {thin.has(zone.id) && <strong> · dünnste Zone</strong>}
              </span>
              <span aria-hidden="true" className="balken">
                <span style={{ width: `${(count / highest) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="quiet">
        Stecklingslicht zählt nicht; es zählt die Zone des Standorts, sonst die der Art.
      </p>
      {rest && <p className="quiet">{rest}</p>}
    </section>
  );
}
