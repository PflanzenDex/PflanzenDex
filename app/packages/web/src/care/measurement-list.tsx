import type { MeasurementRow } from "@pflanzendex/core";
import { QUALITY_NAME, dateText, valueText } from "./text";

/** The measurements of a specimen, newest first. Without a measurement the list says what to do (P-09). */
export function MeasurementList({ measurements }: { measurements: readonly MeasurementRow[] }) {
  return (
    <section aria-labelledby="verlauf-title">
      <h2 id="verlauf-title">Verlauf</h2>
      {measurements.length === 0 ? (
        <p className="empty">Noch keine Messung. Trage oben den ersten Messwert ein.</p>
      ) : (
        <ul className="list">
          {measurements.map((m) => (
            <li key={m.id} className="entry">
              <h3>
                {valueText(m.value)} · {dateText(m.date)}
              </h3>
              <p className="quiet">{QUALITY_NAME[m.quality]}</p>
              {m.note && <p className="quiet">{m.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
