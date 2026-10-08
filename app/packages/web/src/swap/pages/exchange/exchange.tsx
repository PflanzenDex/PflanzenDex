import { useCallback } from "react";
import { Link } from "react-router";
import type { OfferView } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { loadExchange, withdrawOffer, type ExchangeData } from "../../api/offers-api";
import { OfferForm } from "../../parts/offer-form/offer-form";
import { OfferList } from "../../parts/offer-list/offer-list";
import { ExchangeSkeleton } from "./exchange.skeleton";

const KEY = ["swap", "offers"] as const;
type Token = () => Promise<string | undefined>;

function Body(props: { data: ExchangeData; api: string; token: Token; onWritten: () => void }) {
  const { api } = props;
  const withdraw = useWriteAction(props.token, props.onWritten);
  return (
    <div className="flex min-w-0 flex-col gap-6">
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
      <OfferList
        offers={props.data.offers}
        busy={withdraw.running}
        onWithdraw={(o: OfferView) =>
          void withdraw.run(
            (t) => withdrawOffer(api, t, o.id),
            `Das Angebot für ${o.specimenName ?? "das Exemplar"} ist zurückgezogen.`,
          )
        }
      />
      <OfferForm
        api={api}
        token={props.token}
        specimens={props.data.specimens}
        onChanged={props.onWritten}
      />
    </div>
  );
}

/**
 * The exchange (US-SOZ-08, ADR 0012): my offers and the dialog to offer a specimen for swapping or giving away. The offers of
 * friends and the requests follow with US-SOZ-09. Private by default: nothing is offered without the sharing of the
 * specimen (P-05), and there are no rankings (FR-SOZ-11).
 */
export function ExchangePage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadExchange(api, t), [api]);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <section aria-labelledby="exchange-title" className="flex min-w-0 flex-col gap-3">
        <div>
          <Button asChild variant="outline" size="touch">
            <Link to="/friends">Zurück zu Freunde</Link>
          </Button>
        </div>
        <h1 id="exchange-title" className="text-2xl font-semibold">
          Tauschbörse
        </h1>
        <p className="text-muted-foreground">
          Biete Exemplare zum Tausch oder zum Verschenken an. Nur deine Freunde sehen ein Angebot,
          und nur, was du für sie freigegeben hast.
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
