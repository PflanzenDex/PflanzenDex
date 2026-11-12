import { useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import type { OfferView } from "@pflanzendex/core";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import {
  LayerHost,
  LayerSheet,
  useLayer,
} from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { dropPageParts, PAGE_PARAM } from "@/shared/patterns/responsive/pager/pager";
import { Button } from "@/shared/ui/button/button";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { errorText } from "@/shared/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../shared/data";
import { loadExchange, withdrawOffer, type ExchangeData } from "../../api/offers-api";
import { SwapRequests } from "../../parts/swap-requests/swap-requests";
import { FriendOffers } from "../../parts/friend-offers/friend-offers";
import { SwapHistory } from "../../parts/swap-history/swap-history";
import { OfferForm } from "../../parts/offer-form/offer-form";
import { OfferList } from "../../parts/offer-list/offer-list";
import { ExchangeSkeleton } from "./exchange.skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../swap.de.json";

const t = texts(table);

const KEY = ["swap", "offers"] as const;
type Token = () => Promise<string | undefined>;

const OFFER_LAYER = "offer";
const PART_VALUES = ["mine", "friends", "requests", "history"] as const;
type Part = (typeof PART_VALUES)[number];
const isPart = (v: string | null): v is Part => PART_VALUES.some((p) => p === v);

/** The part of the exchange from the address (`part=`); choosing one starts its list at the first entry (the parts share `from`). */
function usePart(): [Part, (value: Part) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("part");
  const part: Part = isPart(raw) ? raw : "mine";
  // A changed part starts at its first entry: the parts share the address part `from`; `rfrom` and `sfrom` go with it,
  // as `rpage` and `spage` did.
  const choose = (value: Part) => {
    const next = new URLSearchParams(params);
    dropPageParts(next, PAGE_PARAM, "rfrom", "sfrom");
    if (value === "mine") next.delete("part");
    else next.set("part", value);
    setParams(next, { replace: true });
  };
  return [part, choose];
}

/** "Zum Tausch anbieten" next to the heading: it opens the layer `?sheet=offer` that the loaded page holds. */
function OfferOpener() {
  const layer = useLayer(OFFER_LAYER);
  return (
    <Button
      type="button"
      size="touch"
      className="w-auto"
      aria-haspopup="dialog"
      onClick={(event) => layer.openLayer(event.currentTarget)}
    >
      {t("exchange.offer")}
    </Button>
  );
}

function Body(props: { data: ExchangeData; api: string; token: Token; onWritten: () => void }) {
  const { api } = props;
  const withdraw = useWriteAction(props.token, props.onWritten);
  const layer = useLayer(OFFER_LAYER);
  const say = useSay();
  const [part, choose] = usePart();
  return (
    // The part's list takes the free height of the page, page by page (US-QS-20, issue 1157).
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {withdraw.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {withdraw.message}
        </p>
      )}
      {withdraw.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(withdraw.error.code)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={t("exchange.parts")}
          options={PART_VALUES.map((value) => ({ value, label: t(`exchange.part.${value}`) }))}
          value={part}
          onChange={choose}
        />
      </div>
      {part === "mine" && (
        <OfferList
          offers={props.data.offers}
          busy={withdraw.running}
          onWithdraw={(o: OfferView) =>
            void withdraw.run(
              (t) => withdrawOffer(api, t, o.id),
              t("exchange.withdrawn", { name: o.specimenName ?? t("exchange.plant") }),
            )
          }
        />
      )}
      {part === "requests" && <SwapRequests api={api} token={props.token} />}
      {part === "friends" && <FriendOffers api={api} token={props.token} />}
      {part === "history" && <SwapHistory api={api} token={props.token} />}
      <LayerSheet id={OFFER_LAYER} title={t("exchange.offer")}>
        {layer.open ? (
          <OfferForm
            api={api}
            token={props.token}
            specimens={props.data.specimens}
            onChanged={props.onWritten}
            onCreated={(message) => {
              layer.closeLayer();
              say(message);
            }}
          />
        ) : null}
      </LayerSheet>
    </div>
  );
}

/**
 * The exchange (US-SOZ-08, US-QS-20, ADR 0012): my offers on a page of the list, the dialog to offer a specimen for
 * swapping or giving away in the layer `?sheet=offer`, and the other parts (offers of friends, requests, history,
 * US-SOZ-09 to US-SOZ-13) one at a time behind a switch, each paged. Private by default: nothing is offered without the
 * sharing of the specimen (P-05), and there are no rankings (FR-SOZ-11).
 */
export function ExchangePage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadExchange(api, t), [api]);
  return (
    // One screen (US-QS-15, issue 1157): the frame fills the window and the lists page by the free height.
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <FullView
        headingId="exchange-title"
        title={t("exchange.title")}
        back={{ label: t("exchange.back"), to: "/friends" }}
        action={<OfferOpener />}
      >
        <div>
          <Button asChild variant="outline" size="touch" className="w-auto">
            <Link to="/friends/match">{t("exchange.match")}</Link>
          </Button>
        </div>
        <p className="hidden text-muted-foreground md:block">{t("exchange.privacy")}</p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText={t("exchange.loading")}
          loadingFallback={<ExchangeSkeleton label={t("exchange.loading")} />}
        >
          {(data: ExchangeData) => <Body data={data} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </FullView>
    </LayerHost>
  );
}
