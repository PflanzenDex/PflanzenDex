import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExchangeOffer, OfferType } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Badge } from "@/components/ui/display/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { Select } from "@/components/ui/fields/select/select";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import {
  loadFriendOffers,
  requestOffer,
  type ExchangeFilters,
  type FriendOffersData,
  type RequestInput,
} from "../../api/exchange-api";
import { useCardPageSize } from "@/components/shared/responsive/pager/card-page-size";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";
import { RequestForm } from "./request-form/request-form";
import { texts } from "@/lib/text-rules/texts";
import table from "../../swap.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

const title = (o: ExchangeOffer): string => o.speciesGerman ?? o.speciesLatin ?? "Art unbekannt";

function Filters(props: { value: ExchangeFilters; onChange: (v: ExchangeFilters) => void }) {
  const { value } = props;
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <label className="grid gap-1 text-sm font-medium">
        <span className="sr-only">{t("friends.typeLabel")}</span>
        <Select
          value={value.type}
          onChange={(e) => props.onChange({ ...value, type: e.target.value as OfferType | "" })}
        >
          <option value="">{t("friends.allTypes")}</option>
          {(Object.keys(TYPE_TEXT) as OfferType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_TEXT[t]}
            </option>
          ))}
        </Select>
      </label>
      <Checkbox
        checked={value.lack}
        onChange={(e) => props.onChange({ ...value, lack: e.target.checked })}
      >
        {t("friends.lackFilter")}
      </Checkbox>
    </div>
  );
}

function Card(props: {
  o: ExchangeOffer;
  open: boolean;
  data: FriendOffersData;
  busy: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSend: (input: RequestInput) => void;
}) {
  const { o } = props;
  return (
    <div className="grid min-w-0 gap-1 break-words rounded-lg border border-border p-3">
      <span className="font-semibold">{title(o)}</span>
      {o.speciesLatin && o.speciesGerman && (
        <span className="text-sm italic">{o.speciesLatin}</span>
      )}
      <span className="text-sm">
        {o.ownerName ?? t("friends.someone")} · {TYPE_TEXT[o.type]} · {MODE_TEXT[o.mode]}
      </span>
      {o.wish && <span className="text-sm">{t("card.wish", { wish: o.wish })}</span>}
      {o.note && <span className="text-sm">{t("card.note", { note: o.note })}</span>}
      <span className="text-sm text-muted-foreground">{healthText(o.health)}</span>
      {o.phase === "dormancy" && (
        <span className="text-sm text-muted-foreground">{t("card.dormancy")}</span>
      )}
      <span className="mt-1 flex flex-wrap items-center gap-2">
        {o.lack === true && <Badge variant="default">{t("friends.lack")}</Badge>}
        {o.onWishlist && <Badge variant="outline">{t("friends.onWishlist")}</Badge>}
        {o.requested && <Badge variant="secondary">{t("friends.requested")}</Badge>}
      </span>
      {!o.requested && !props.open && (
        <div className="mt-1">
          <Button
            type="button"
            size="touch"
            variant="outline"
            aria-label={t("friends.request", { title: title(o) })}
            onClick={props.onOpen}
          >
            {t("friends.requestButton")}
          </Button>
        </div>
      )}
      {!o.requested && props.open && (
        <RequestForm
          offer={o}
          title={title(o)}
          choices={props.data.counterChoices}
          busy={props.busy}
          onSend={props.onSend}
          onCancel={props.onCancel}
        />
      )}
    </div>
  );
}

function Offers(props: {
  data: FriendOffersData;
  api: string;
  token: Token;
  onRequested: () => void;
}) {
  const { data, api } = props;
  const size = useCardPageSize();
  const [openId, setOpenId] = useState<string | null>(null);
  const write = useWriteAction(props.token, props.onRequested);
  useEffect(() => {
    if (write.message) setOpenId(null);
  }, [write.message]);
  if (data.offers.length === 0)
    return <p className="rounded-lg border border-dashed border-border p-3">{t("friends.none")}</p>;
  return (
    <>
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
      <Pager
        items={data.offers}
        pageSize={size}
        fit
        label={t("friends.title")}
        getKey={(o) => o.offerId}
        renderItem={(o) => (
          <Card
            o={o}
            data={data}
            open={openId === o.offerId}
            busy={write.running}
            onOpen={() => setOpenId(o.offerId)}
            onCancel={() => setOpenId(null)}
            onSend={(input) =>
              void write.run(
                (t) => requestOffer({ api, token: t }, o.offerId, input),
                t("friends.sent", { title: title(o) }),
              )
            }
          />
        )}
      />
    </>
  );
}

/**
 * The open offers of friends (US-SOZ-09): species, giver, type, mode, health details, the chip "you lack it" and a hint
 * when the species is on my wishlist (the list itself is never transmitted, FR-WUN-07). Filters by type and "you lack
 * it". "Anfragen" opens the request: for a swap with an own shared specimen as counter-offer or free text, or left
 * open. Without offers the section says what to do next (P-09).
 */
export function FriendOffers(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [filters, setFilters] = useState<ExchangeFilters>({ type: "", lack: false });
  const key = useMemo(() => ["swap", "friend-offers", filters.type, filters.lack], [filters]);
  const reload = useInvalidate(key);
  const load = useCallback((t: string) => loadFriendOffers(api, t, filters), [api, filters]);
  return (
    <section
      aria-labelledby="friend-offers-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="friend-offers-title" className="sr-only">
        {t("friends.title")}
      </h2>
      <Filters value={filters} onChange={setFilters} />
      <LoadFrame queryKey={key} token={token} load={load} loadingText={t("friends.loading")}>
        {(data: FriendOffersData) => (
          <Offers data={data} api={api} token={token} onRequested={reload} />
        )}
      </LoadFrame>
    </section>
  );
}
