import type { NichtGezaehlt, Verteilung } from "@pflanzendex/core";

const exemplare = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** Was nicht mitgezählt wurde und warum; nichts verschwindet still (P-10). Leer, wenn alles gezählt ist. */
function nichtMitgezaehlt(n: NichtGezaehlt): string | null {
  const teile = [
    n.stecklingslicht > 0 && `${n.stecklingslicht} unter Stecklingslicht`,
    n.archiviert > 0 && `${n.archiviert} archiviert`,
    n.zoneUnbekannt > 0 && `${n.zoneUnbekannt} mit unbekannter Zone`,
  ].filter(Boolean);
  return teile.length === 0 ? null : `Nicht mitgezählt: ${teile.join(", ")}.`;
}

/**
 * Wo noch Platz ist (US-LIC-02): Exemplare je Lichtzone 2 bis 4, die dünnste Zone (bei Gleichstand alle) und was als
 * Nächstes zu tun ist (P-09). Stecklingslicht zählt nicht; die Zahlen kommen von der API, hier wird nichts gerechnet.
 */
export function VerteilungAnsicht({ verteilung }: { verteilung: Verteilung }) {
  const duenn = new Set(verteilung.duennste.map((z) => z.id));
  const hoechste = Math.max(1, ...verteilung.zonen.map((z) => z.anzahl));
  const rest = nichtMitgezaehlt(verteilung.nichtGezaehlt);
  return (
    <section aria-labelledby="verteilung-titel" className="verteilung">
      <h2 id="verteilung-titel">Verteilung auf die Lichtzonen</h2>
      <p>{verteilung.hinweis.text}</p>
      <p className="naechste-handlung">{verteilung.hinweis.naechsteHandlung}</p>
      {verteilung.zonen.length > 0 && (
        <ul aria-label="Exemplare je Lichtzone" className="verteilung-liste">
          {verteilung.zonen.map(({ zone, anzahl }) => (
            <li key={zone.id} className={duenn.has(zone.id) ? "duennste" : undefined}>
              <span>
                {zone.name}: {exemplare(anzahl)}
                {duenn.has(zone.id) && <strong> · dünnste Zone</strong>}
              </span>
              <span aria-hidden="true" className="balken">
                <span style={{ width: `${(anzahl / hoechste) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="leise">
        Stecklingslicht zählt nicht; es zählt die Zone des Standorts, sonst die der Art.
      </p>
      {rest && <p className="leise">{rest}</p>}
    </section>
  );
}
