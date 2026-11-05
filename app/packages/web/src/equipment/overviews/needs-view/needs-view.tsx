import type { Need } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../equipment.de.json";

const t = texts(table);

/** Needs per page until the layout measures the free height of the layer (starting value, assumption; #1029, issue 1154). */
const NEEDS_PER_PAGE = 2;

/**
 * "Fehlt / Nachkaufen" (US-EQU-07): what is missing, each item with its reason, the source in the keeper's own data and
 * what to do next (P-09). Derived, no urgency and no prices (P-08), and no advertising: recommendations are a separate,
 * later story. When nothing is missing the block says so.
 */
export function NeedsView(props: { needs: readonly Need[] }) {
  const { needs } = props;
  return (
    <section
      aria-labelledby="equipment-needs-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="equipment-needs-title" className="text-base font-semibold">
        {t("needs.title")}
      </h2>
      {needs.length === 0 ? (
        <p className="m-0 text-muted-foreground">{t("needs.none")}</p>
      ) : (
        <Pager
          items={needs}
          pageSize={NEEDS_PER_PAGE}
          fit
          label={t("needs.title")}
          param={LAYER_PARAM}
          replace
          getKey={(n) => n.id}
          renderItem={(n) => (
            <div className="min-w-0 rounded-lg border border-border p-3">
              <p className="m-0 break-words">{n.reason}</p>
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                {t("needs.source", { source: n.source })}
              </p>
              <p className="m-0 mt-1 text-sm">{n.nextAction}</p>
            </div>
          )}
        />
      )}
    </section>
  );
}
