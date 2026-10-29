import { useCallback, useEffect } from "react";
import { LoadFrame, useInvalidate } from "../../kernel";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { WriteOutcome, type WishToPlant } from "../actions/actions";
import { loadWishlist, type Wishlist } from "../wishlist-api";
import { Candidates, Controls } from "./parts/candidates/candidates";
import { useWishWrites } from "./parts/use-wish-writes/use-wish-writes";
import { HINTS_LAYER, WishlistLayers } from "./layers/wishlist-layers/wishlist-layers";
import { WishlistPageSkeleton } from "./wishlist-page.skeleton";

const KEY = ["wishlist", "candidates"] as const;
type Token = () => Promise<string | undefined>;

/**
 * The wishlist on one screen (US-QS-22): the outcome of the last write, one line of help, one row of controls and the
 * ranked wishes as compact rows in pages. The form, the full card, the history and the hints are layers.
 */
function Body(props: {
  data: Wishlist;
  api: string;
  token: Token;
  onWritten: () => void;
  onCreateSpecimen?: (w: WishToPlant) => void;
}) {
  const { data, api, token, onCreateSpecimen } = props;
  const { write, candidate, repair, outcome, send } = useWishWrites(api, token, props.onWritten);
  const hintsOpen = useLayer(HINTS_LAYER).open;
  const outcomeNode = (
    <WriteOutcome
      done={outcome.done}
      error={outcome.error}
      {...(onCreateSpecimen ? { onCreateSpecimen } : {})}
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {write.message ? (
        <p role="status" className="rounded-lg border border-border p-2">
          {write.message}
        </p>
      ) : null}
      {hintsOpen ? null : outcomeNode}
      <Controls data={data} />
      <Candidates
        list={data.list}
        onBuy={candidate.buy}
        onDiscard={candidate.discard}
        busy={candidate.running}
      />
      <WishlistLayers
        data={data}
        access={{ api, token }}
        running={write.running}
        error={write.error}
        onSend={send}
        card={{
          onBuy: candidate.buy,
          onDiscard: candidate.discard,
          onStoreImage: candidate.storeImage,
          busy: candidate.running,
        }}
        repair={repair}
        outcome={hintsOpen ? outcomeNode : null}
        {...(onCreateSpecimen ? { onCreateSpecimen } : {})}
      />
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
 * The wishlist (US-WUN-01): the open candidates sorted by the stock of their target light zone, thinnest first, as compact
 * rows in pages with the actions "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05) (US-QS-22). The form, the full card,
 * the bought and discarded wishes (with the way to the plant, US-WUN-05) and the hints are layers. `onCreateSpecimen`
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
