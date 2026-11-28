import type { OfferView } from "@pflanzendex/core";
import { metaParts } from "@/shared/lists/grouped-list/row-parts/row-parts.meta";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { useCardPageSize } from "@/shared/patterns/responsive/entry-list/card-page-size";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../swap.de.json";

const t = texts(table);

const STATUS_TEXT = {
  open: "Offen",
  reserved: "Reserviert",
  handed_over: "Übergeben",
  withdrawn: "Zurückgezogen",
} as const;

/**
 * My offers (US-SOZ-08): type, mode, wish, note, health details (open treatment or the last one, never agent or notes)
 * and the dormancy phase; withdrawing is possible while an offer is open or reserved. Withdrawn and handed-over offers
 * stay in the list (P-10). Without offers the section says what to do next (P-09).
 */
export function OfferList(props: {
  offers: readonly OfferView[];
  busy: boolean;
  onWithdraw: (o: OfferView) => void;
}) {
  const size = useCardPageSize();
  return (
    <section
      aria-labelledby="offer-list-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="offer-list-title" className="sr-only">
        {t("offers.title")}
      </h2>
      {props.offers.length === 0 ? (
        // One line only: "Zum Tausch anbieten" stands in the page's title bar (SG-STATE-01, issue 2233).
        <EmptySection text={t("offers.none")} />
      ) : (
        <ScrollEntries
          items={props.offers}
          pageSize={size}
          fit
          label={t("offers.title")}
          getKey={(o) => o.id}
          renderItem={(o) => (
            <OfferCard offer={o} busy={props.busy} onWithdraw={() => props.onWithdraw(o)} />
          )}
        />
      )}
    </section>
  );
}

/**
 * One of my offers with its state; an open or reserved one can be withdrawn (US-SOZ-08). The state stands in the title
 * row, so a card has no row of its own for it: two whole cards fit the first screen of a phone (US-QS-32, SG-LIST-01).
 */
function OfferCard({
  offer: o,
  busy,
  onWithdraw,
}: {
  offer: OfferView;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const active = o.status === "open" || o.status === "reserved";
  return (
    <div className="grid break-words rounded-lg border border-border p-3">
      <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 font-semibold">{o.specimenName ?? t("offers.plantUnknown")}</span>
        <Badge variant={active ? "default" : "outline"} className="shrink-0">
          {STATUS_TEXT[o.status]}
        </Badge>
      </span>
      <span className="text-sm">{metaParts(`${TYPE_TEXT[o.type]} · ${MODE_TEXT[o.mode]}`)}</span>
      {o.wish && <span className="text-sm">{t("card.wish", { wish: o.wish })}</span>}
      {o.note && <span className="text-sm">{t("card.note", { note: o.note })}</span>}
      <span className="text-sm text-muted-foreground">{healthText(o.health)}</span>
      {o.phase === "dormancy" && (
        <span className="text-sm text-muted-foreground">{t("card.dormancy")}</span>
      )}
      {active && (
        <span className="mt-1 flex">
          <Button
            type="button"
            size="touch"
            variant="plain"
            disabled={busy}
            aria-label={t("offers.withdraw", { name: o.specimenName ?? t("offers.plant") })}
            onClick={onWithdraw}
          >
            {t("offers.withdrawButton")}
          </Button>
        </span>
      )}
    </div>
  );
}
