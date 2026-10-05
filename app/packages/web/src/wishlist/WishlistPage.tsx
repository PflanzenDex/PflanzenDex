import { useCallback, useEffect, useRef, useState } from "react";
import type { Candidate, CandidateList, WishBuyResult } from "@pflanzendex/core";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../kernel";
import { EmptyState } from "@/components/shared/empty-state";
import { BoughtList } from "./bought-list/bought-list";
import { CandidateCard } from "./candidate-card";
import { WishForm } from "./wish-form";
import { WishlistPageSkeleton } from "./WishlistPage.skeleton";
import { buyWish, createWish, loadWishlist, type WishInput, type Wishlist } from "./wishlist-api";

/** Next action of an empty list: take the keeper to the form below. */
const focusForm = () =>
  document
    .querySelector<HTMLElement>('section[aria-labelledby="wish-form-title"] input[name="name"]')
    ?.focus();

const KEY = ["wishlist", "candidates"] as const;
type Token = () => Promise<string | undefined>;

/** "Gekauft" (US-WUN-03): the answer of the server says what happened and what comes next (P-09, P-10). */
function useBuy(api: string, token: Token, onWritten: () => void) {
  const write = useWriteAction(token, onWritten);
  const [done, setDone] = useState<WishBuyResult["hint"] | null>(null);
  const buy = (c: Candidate) =>
    void write.run(async (t) => {
      const r = await buyWish(api, t, c.id);
      setDone(r.ok ? r.value.hint : null);
      return r;
    }, "");
  return { buy, done, running: write.running, error: write.error };
}

function BuyOutcome({ done, error }: Pick<ReturnType<typeof useBuy>, "done" | "error">) {
  if (error)
    return (
      <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
        {errorText(error.code)}
      </p>
    );
  if (!done) return null;
  return <Done done={done} />;
}

/** The confirmation takes the focus, so a keeper who tapped far down the list sees what happened (P-10). */
function Done({ done }: { done: WishBuyResult["hint"] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [done]);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="rounded-lg border border-primary p-3">
      <p>{done.text}</p>
      <p className="mt-1 font-semibold">{done.nextAction}</p>
    </div>
  );
}

function Candidates(props: { list: CandidateList; onBuy: (c: Candidate) => void; busy: boolean }) {
  const { list } = props;
  if (list.candidates.length === 0)
    return (
      <EmptyState
        title={list.hint.text}
        description={list.hint.nextAction}
        action={{ label: "Wunsch erfassen", onClick: focusForm }}
      />
    );
  return (
    <>
      <div className="rounded-lg border border-border p-3">
        <p>{list.hint.text}</p>
        <p className="mt-1 font-semibold">{list.hint.nextAction}</p>
      </div>
      <ul
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Offene Kandidaten"
      >
        {list.candidates.map((c, i) => (
          <CandidateCard key={c.id} c={c} rank={i + 1} onBuy={props.onBuy} busy={props.busy} />
        ))}
      </ul>
    </>
  );
}

/** The list with what to do next, the form to record a wish and the bought wishes; a write reloads all (P-10). */
function Body(props: { data: Wishlist; api: string; token: Token; onWritten: () => void }) {
  const { data, api, token } = props;
  const write = useWriteAction(token, props.onWritten);
  const purchase = useBuy(api, token, props.onWritten);
  const send = async (input: WishInput): Promise<boolean> => {
    let saved = false;
    await write.run(async (t) => {
      const r = await createWish(api, t, input);
      saved = r.ok;
      return r;
    }, `Wunsch „${input.name}“ gespeichert.`);
    return saved;
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BuyOutcome done={purchase.done} error={purchase.error} />
      <Candidates list={data.list} onBuy={purchase.buy} busy={purchase.running} />
      <WishForm
        zones={data.list.zones}
        running={write.running}
        message={write.message}
        error={write.error}
        onSend={send}
      />
      <BoughtList bought={data.bought} />
    </div>
  );
}

/**
 * The wishlist (US-WUN-01): the open candidates sorted by the stock of their target light zone, thinnest first, each
 * with the reason for its place and the action "Gekauft" (US-WUN-03); below it the form to record a wish and the
 * bought wishes.
 */
export function WishlistPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadWishlist(api, t), [api]);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <section aria-labelledby="wishlist-title" className="flex min-w-0 flex-col gap-3">
        <h1 id="wishlist-title" className="text-2xl font-semibold">
          Wunschliste
        </h1>
        <p className="text-muted-foreground">
          Deine offenen Wünsche, geordnet nach Platz: oben steht, was in die Zone mit den wenigsten
          Pflanzen kommt.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Wunschliste wird geladen …"
          loadingFallback={<WishlistPageSkeleton label="Wunschliste wird geladen …" />}
        >
          {(data: Wishlist) => <Body data={data} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </section>
    </div>
  );
}
