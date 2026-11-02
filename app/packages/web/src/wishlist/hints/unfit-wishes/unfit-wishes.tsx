import type { UnfitWish } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { texts } from "@/lib/text-rules/texts";
import table from "../../wishlist.de.json";

const t = texts(table);
/** Wishes per page until the layout measures the free height of the layer (starting value, assumption; issue 1154). */
const PAGE_SIZE = 2;

/**
 * Open wishes that do not count in the space question (FR-WUN-03): no target zone, or the cutting light. Each line
 * names the wish, its zone ("unbekannt" if there is none, P-08), why it does not count and what to do next (P-09).
 * Nothing is removed or changed here (P-10): the wish stays among the candidates, where it can be discarded. In the
 * layer "Hinweise" the wishes page by its free height instead of scrolling it, and a next step shared by all is said
 * once above them (US-QS-15, issue 1154).
 */
export function UnfitWishes({ wishes }: { wishes: readonly UnfitWish[] }) {
  if (wishes.length === 0) return null;
  // One next step for every wish is said once above the list, not on every row (issue 1154).
  const shared = wishes.every((w) => w.nextAction === wishes[0]?.nextAction)
    ? (wishes[0]?.nextAction ?? null)
    : null;
  return (
    <section
      aria-labelledby="unfit-wishes-title"
      className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <h2 id="unfit-wishes-title" className="text-lg font-semibold">
        {t("unfit.title")}
      </h2>
      {shared ? <p className="font-semibold">{shared}</p> : null}
      <Pager
        items={wishes}
        pageSize={PAGE_SIZE}
        fit
        label={t("unfit.title")}
        param={LAYER_PARAM}
        replace
        listClassName="gap-3"
        getKey={(w) => w.id}
        renderItem={(w) => (
          <div className="grid gap-1">
            <p className="font-semibold">{w.title}</p>
            <p className="text-sm text-muted-foreground">
              {t("unfit.zone", { zone: w.zone ?? t("unfit.unknown") })}
            </p>
            <p>{w.reason}</p>
            {shared ? null : <p className="font-semibold">{w.nextAction}</p>}
          </div>
        )}
      />
    </section>
  );
}
