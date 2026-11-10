import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import type { LightOverview, LightOverviewRow } from "../../shared/light-api/light-api";
import { zoneLabel } from "@pflanzendex/core";
import { Pager, LAYER_PARAM } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import { LightNeedAction } from "../../shared/ui/light-need-action/light-need-action";
import table from "../../light.de.json";

const t = texts(table);

/** Species per page until the layout measures the free height of the layer (starting value, assumption; issue 1155). */
const PAGE_SIZE = 4;

const lux = new Intl.NumberFormat("de-DE");

/**
 * One species: its name, zone and lux need, and where it stands; unknown values say so (P-08). An unknown lux need names
 * the next step on the row itself (P-09).
 */
function Row({ r }: { r: LightOverviewRow }) {
  const zone = r.zone ? zoneLabel(r.zone.name) : t("overview.zoneUnknown");
  const need = r.lightDemandLux === null ? t("overview.unknown") : lux.format(r.lightDemandLux);
  return (
    <div className="grid min-w-0 gap-0.5 break-words rounded-lg border border-border p-3 text-sm">
      <span className="text-base font-semibold">{r.speciesName}</span>
      <span className="tabular-nums text-muted-foreground">
        {t("overview.facts", { zone, lux: need })}
      </span>
      {r.position ? <span>{r.position.description}</span> : null}
      {r.lightNeedUnknown ? (
        <span className="pt-1">
          <LightNeedAction speciesId={r.speciesId} speciesName={r.speciesName} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * US-LIC-03: species by light hunger with position recommendations. In the layer the species are compact rows paged by
 * its free height instead of a table that scrolls the layer (US-QS-15, issue 1155); a species with an unknown lux need
 * has no position and stays last, with its next step on the row (P-09, P-10).
 */
export function LightOverviewView(props: { data: LightOverview; onOpenCollection: () => void }) {
  const { data, onOpenCollection } = props;
  return (
    <section aria-labelledby="overview" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <h2 id="overview" className="text-xl font-semibold">
        {t("overview.title")}
      </h2>
      {data.rows.length === 0 ? (
        <EmptyState
          title={t("overview.none.title")}
          description={t("overview.none.description")}
          action={{ label: t("overview.none.action"), onClick: onOpenCollection }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("overview.intro")}</p>
          <Pager
            items={data.rows}
            pageSize={PAGE_SIZE}
            fit
            label={t("overview.list")}
            param={LAYER_PARAM}
            replace
            getKey={(r) => r.speciesId}
            renderItem={(r) => <Row r={r} />}
          />
        </>
      )}
    </section>
  );
}
