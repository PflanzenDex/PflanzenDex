import type { ArchivedEntry } from "@pflanzendex/core";
import { UNKNOWN, dateText } from "./text";

/**
 * The archive (US-BES-07): archived specimens with species, date and reason, each with "Restore". Without archived
 * specimens the section does not exist.
 */
export function ArchivedList(props: {
  entries: readonly ArchivedEntry[];
  onRestore: (e: { id: string; name: string }) => void;
}) {
  if (props.entries.length === 0) return null;
  return (
    <section aria-labelledby="archived-title" className="archived">
      <h2 id="archived-title">Archiv</h2>
      <p className="quiet">
        Archivierte Exemplare fehlen in Liste und Auswertungen. Ihre Historie bleibt erhalten.
      </p>
      <ul className="cards-grid">
        {props.entries.map((e) => (
          <li key={e.id} className="specimen-card">
            <h3>{e.name}</h3>
            <p className="quiet">Art: {e.speciesName ?? UNKNOWN}</p>
            <p className="quiet">Archiviert am {dateText(e.archivedAt)}</p>
            <p className="quiet">Grund: {e.archivedReason}</p>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Wiederherstellen: ${e.name}`}
                onClick={() => props.onRestore(e)}
              >
                Wiederherstellen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
