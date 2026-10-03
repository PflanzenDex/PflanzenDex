import type { MessAnsicht } from "@pflanzendex/core";
import { massName, messungText, QUALITAET_NAME } from "./text";

/** Was messen, letzte Messung und letzte Bewertung (US-WAC-01); abgeleitet, nie gespeichert (P-01). */
export function MessKopf({ ansicht }: { ansicht: MessAnsicht }) {
  const { letzte, letzteBewertung } = ansicht;
  return (
    <dl className="messkopf">
      <div>
        <dt>Was messen?</dt>
        <dd>
          {massName(ansicht.wachstumsmass)}. Miss immer dasselbe Maß an derselben Stelle, sonst sind
          die Werte nicht vergleichbar.
        </dd>
      </div>
      <div>
        <dt>Letzte Messung</dt>
        <dd>{letzte ? messungText(letzte) : "noch keine Messung"}</dd>
      </div>
      <div>
        <dt>Letzte Bewertung</dt>
        <dd>{letzteBewertung ? QUALITAET_NAME[letzteBewertung] : "noch keine Bewertung"}</dd>
      </div>
    </dl>
  );
}
