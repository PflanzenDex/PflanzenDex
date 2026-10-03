import type { MessungZeile } from "@pflanzendex/core";
import { QUALITAET_NAME, datumText, wertText } from "./text";

/** Die Messungen eines Exemplars, neueste zuerst. Ohne Messung sagt die Liste, was zu tun ist (P-09). */
export function MessungListe({ messungen }: { messungen: readonly MessungZeile[] }) {
  return (
    <section aria-labelledby="verlauf-titel">
      <h2 id="verlauf-titel">Verlauf</h2>
      {messungen.length === 0 ? (
        <p className="leer">Noch keine Messung. Trage oben den ersten Messwert ein.</p>
      ) : (
        <ul className="liste">
          {messungen.map((m) => (
            <li key={m.id} className="eintrag">
              <h3>
                {wertText(m.wert)} · {datumText(m.datum)}
              </h3>
              <p className="leise">{QUALITAET_NAME[m.qualitaet]}</p>
              {m.notiz && <p className="leise">{m.notiz}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
