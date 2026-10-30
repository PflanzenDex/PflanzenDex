import type { Need } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";

/** Needs per page of the layer (starting value, assumption; the page size from the free height is #1029). */
const NEEDS_PER_PAGE = 3;

/**
 * "Fehlt / Nachkaufen" (US-EQU-07): what is missing, each item with its reason, the source in the keeper's own data and
 * what to do next (P-09). Derived, no urgency and no prices (P-08), and no advertising: recommendations are a separate,
 * later story. When nothing is missing the block says so.
 */
export function NeedsView(props: { needs: readonly Need[] }) {
  const { needs } = props;
  return (
    <section aria-labelledby="equipment-needs-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-needs-title" className="text-base font-semibold">
        Fehlt / Nachkaufen
      </h2>
      {needs.length === 0 ? (
        <p className="m-0 text-muted-foreground">
          Nach deinen Angaben fehlt nichts: Vorräte, Lampen und Geräte passen zu deinen Pflanzen und
          Wünschen.
        </p>
      ) : (
        <Pager
          items={needs}
          pageSize={NEEDS_PER_PAGE}
          label="Fehlt / Nachkaufen"
          param={LAYER_PARAM}
          getKey={(n) => n.id}
          renderItem={(n) => (
            <div className="min-w-0 rounded-lg border border-border p-3">
              <p className="m-0 break-words">{n.reason}</p>
              <p className="m-0 mt-1 text-sm text-muted-foreground">Quelle: {n.source}</p>
              <p className="m-0 mt-1 text-sm">{n.nextAction}</p>
            </div>
          )}
        />
      )}
    </section>
  );
}
