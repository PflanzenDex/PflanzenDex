import { useCallback, useEffect, useState } from "react";
import type { Candidate, CandidateList } from "@pflanzendex/core";
import { LoadFrame, useInvalidate, useWriteAction } from "../kernel";
import { EmptyState } from "@/components/shared/empty-state";
import { useCandidateWrite, WriteOutcome, type WishToPlant } from "./actions/actions";
import { BoughtList } from "./history/bought-list/bought-list";
import { CandidateCard } from "./candidate-card/candidate-card";
import { DiscardedList } from "./history/discarded-list/discarded-list";
import { ReplenishWarning } from "./replenish-warning/replenish-warning";
import { DuplicateWishes, useRepair } from "./duplicate-wishes/duplicate-wishes";
import { WishForm } from "./wish-form/wish-form";
import { WishlistPageSkeleton } from "./WishlistPage.skeleton";
import { createWish, loadWishlist, type WishInput, type Wishlist } from "./wishlist-api";

/** Next action of an empty list: take the keeper to the form below. */
const focusForm = () =>
  document
    .querySelector<HTMLElement>('section[aria-labelledby="wish-form-title"] input[name="name"]')
    ?.focus();

const KEY = ["wishlist", "candidates"] as const;
type Token = () => Promise<string | undefined>;
type Last = "write" | "repair";

function Candidates(props: {
  list: CandidateList;
  onBuy: (c: Candidate) => void;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
}) {
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
          <CandidateCard
            key={c.id}
            c={c}
            rank={i + 1}
            onBuy={props.onBuy}
            onDiscard={props.onDiscard}
            busy={props.busy}
          />
        ))}
      </ul>
    </>
  );
}

/** The list with what to do next, the form to record a wish and the bought wishes; a write reloads all (P-10). */
function Body(props: {
  data: Wishlist;
  api: string;
  token: Token;
  onWritten: () => void;
  onCreateSpecimen?: (w: WishToPlant) => void;
}) {
  const { data, api, token, onCreateSpecimen } = props;
  const write = useWriteAction(token, props.onWritten);
  // The outcome shown on top is the one of the write that ran last (P-10): an older one never lingers.
  const [last, setLast] = useState<Last>("write");
  const candidate = useCandidateWrite(api, token, props.onWritten, () => setLast("write"));
  const repair = useRepair(api, token, props.onWritten, () => setLast("repair"));
  const outcome =
    last === "repair"
      ? { done: repair.done && { hint: repair.done, toPlant: null }, error: repair.error }
      : candidate;
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
      <WriteOutcome
        done={outcome.done}
        error={outcome.error}
        {...(onCreateSpecimen ? { onCreateSpecimen } : {})}
      />
      <ReplenishWarning replenishment={data.list.replenishment} />
      <DuplicateWishes list={data.list} repair={repair} />
      <Candidates
        list={data.list}
        onBuy={candidate.buy}
        onDiscard={candidate.discard}
        busy={candidate.running}
      />
      <WishForm
        zones={data.list.zones}
        running={write.running}
        message={write.message}
        error={write.error}
        onSend={send}
      />
      <BoughtList bought={data.bought} {...(onCreateSpecimen ? { onCreateSpecimen } : {})} />
      <DiscardedList discarded={data.discarded} />
    </div>
  );
}

/** Set when a destination shows this page below its own title (US-QS-14). */
type Host = { onCaption: (text: string | null) => void };

/** Tells the host the count line of the loaded list and takes it back when the page goes away (US-QS-14). */
function ReportCaption({ host, open }: { host: Host | undefined; open: number }) {
  useEffect(() => {
    host?.onCaption(open === 1 ? "1 offener Wunsch" : `${open} offene Wünsche`);
    return () => host?.onCaption(null);
  }, [host, open]);
  return null;
}

/**
 * The wishlist (US-WUN-01): the open candidates sorted by the stock of their target light zone, thinnest first, each
 * with the reason for its place and the actions "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05); below it the form to
 * record a wish, the bought wishes (with the way to the plant, US-WUN-05) and the discarded wishes. `onCreateSpecimen`
 * starts the creation of a specimen for a bought wish; the app wires it (`wishlist` does not know `collection`).
 */
export function WishlistPage(props: {
  api: string;
  token: Token;
  onCreateSpecimen?: (w: WishToPlant) => void;
  /** The destination "Sammlung" shows the page below its title: no card frame, no main heading (US-QS-14). */
  host?: Host;
}) {
  const { api, token, onCreateSpecimen, host } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadWishlist(api, t), [api]);
  return (
    <div
      className={
        host
          ? "min-w-0"
          : "rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7"
      }
    >
      <section aria-labelledby="wishlist-title" className="flex min-w-0 flex-col gap-3">
        {host ? (
          <h2 id="wishlist-title" className="sr-only">
            Wunschliste
          </h2>
        ) : (
          <h1 id="wishlist-title" className="text-2xl font-semibold">
            Wunschliste
          </h1>
        )}
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
          {(data: Wishlist) => (
            <>
              <ReportCaption host={host} open={data.list.candidates.length} />
              <Body
                data={data}
                api={api}
                token={token}
                onWritten={reload}
                {...(onCreateSpecimen ? { onCreateSpecimen } : {})}
              />
            </>
          )}
        </LoadFrame>
      </section>
    </div>
  );
}
