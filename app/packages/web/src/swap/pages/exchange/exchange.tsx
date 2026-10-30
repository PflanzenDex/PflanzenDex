import { useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import type { OfferView } from "@pflanzendex/core";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { loadExchange, withdrawOffer, type ExchangeData } from "../../api/offers-api";
import { SwapRequests } from "../../parts/swap-requests/swap-requests";
import { FriendOffers } from "../../parts/friend-offers/friend-offers";
import { SwapHistory } from "../../parts/swap-history/swap-history";
import { OfferForm } from "../../parts/offer-form/offer-form";
import { OfferList } from "../../parts/offer-list/offer-list";
import { ExchangeSkeleton } from "./exchange.skeleton";

const KEY = ["swap", "offers"] as const;
type Token = () => Promise<string | undefined>;

const OFFER_LAYER = "offer";
const PARTS = [
  { value: "mine", label: "Meine" },
  { value: "friends", label: "Freunde" },
  { value: "requests", label: "Anfragen" },
  { value: "history", label: "Verlauf" },
] as const;
type Part = (typeof PARTS)[number]["value"];
const isPart = (v: string | null): v is Part => PARTS.some((p) => p.value === v);

/** The part of the exchange from the address (`part=`); choosing one starts its list at page 1 (the parts share `page`). */
function usePart(): [Part, (value: Part) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("part");
  const part: Part = isPart(raw) ? raw : "mine";
  // A changed part starts at its first page: the parts share the address part `page`.
  const choose = (value: Part) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    next.delete("rpage");
    next.delete("spage");
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
      Zum Tausch anbieten
    </Button>
  );
}

function Body(props: { data: ExchangeData; api: string; token: Token; onWritten: () => void }) {
  const { api } = props;
  const withdraw = useWriteAction(props.token, props.onWritten);
  const layer = useLayer(OFFER_LAYER);
  const [part, choose] = usePart();
  return (
    <div className="flex min-w-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
          <SegmentedControl label="Bereich" options={PARTS} value={part} onChange={choose} />
        </div>
        {part === "mine" && (
          <OfferList
            offers={props.data.offers}
            busy={withdraw.running}
            onWithdraw={(o: OfferView) =>
              void withdraw.run(
                (t) => withdrawOffer(api, t, o.id),
                `Das Angebot für ${o.specimenName ?? "die Pflanze"} ist zurückgezogen.`,
              )
            }
          />
        )}
        {part === "requests" && <SwapRequests api={api} token={props.token} />}
        {part === "friends" && <FriendOffers api={api} token={props.token} />}
        {part === "history" && <SwapHistory api={api} token={props.token} />}
      </div>
      <LayerSheet id={OFFER_LAYER} title="Zum Tausch anbieten">
        {layer.open ? (
          <OfferForm
            api={api}
            token={props.token}
            specimens={props.data.specimens}
            onChanged={props.onWritten}
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
    <div className="rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground md:p-7">
      <section aria-labelledby="exchange-title" className="flex min-w-0 flex-col gap-2">
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            size="touch"
            className="min-w-0 flex-1 px-1.5 text-[13px]"
          >
            <Link to="/friends">Zurück zu Freunde</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="touch"
            className="min-w-0 flex-1 px-1.5 text-[13px]"
          >
            <Link to="/friends/match">Passende Angebote</Link>
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 id="exchange-title" className="text-2xl font-semibold">
            Tauschbörse
          </h1>
          <OfferOpener />
        </div>
        <p className="hidden text-muted-foreground md:block">
          Nur deine Freunde sehen ein Angebot, und nur, was du für sie freigegeben hast.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Tauschbörse wird geladen …"
          loadingFallback={<ExchangeSkeleton label="Tauschbörse wird geladen …" />}
          heading="Tauschbörse"
        >
          {(data: ExchangeData) => <Body data={data} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </section>
    </div>
  );
}
