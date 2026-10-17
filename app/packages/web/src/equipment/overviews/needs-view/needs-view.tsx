import type { Need } from "@pflanzendex/core";

/**
 * "Fehlt / Nachkaufen" (US-EQU-07): what is missing, each item with its reason, the source in the keeper's own data and
 * what to do next (P-09). Derived, no urgency and no prices (P-08), and no advertising: recommendations are a separate,
 * later story. When nothing is missing the block says so.
 */
export function NeedsView(props: { needs: readonly Need[] }) {
  const { needs } = props;
  return (
    <section aria-labelledby="equipment-needs-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-needs-title" className="text-xl font-semibold">
        Fehlt / Nachkaufen
      </h2>
      {needs.length === 0 ? (
        <p className="m-0 text-muted-foreground">
          Nach deinen Angaben fehlt nichts: Vorräte, Lampen und Geräte passen zu deinen Pflanzen und
          Wünschen.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {needs.map((n) => (
            <li key={n.id} className="min-w-0 rounded-lg border border-border p-3">
              <p className="m-0 break-words">{n.reason}</p>
              <p className="m-0 mt-1 text-sm text-muted-foreground">Quelle: {n.source}</p>
              <p className="m-0 mt-1 text-sm">{n.nextAction}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
