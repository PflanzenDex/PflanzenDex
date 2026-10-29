import type { Candidate, CandidateList } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerOpener, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import { Button } from "@/components/ui/button/button";
import type { Wishlist } from "../../../wishlist-api";
import { WishRow } from "../../rows/wish-row/wish-row";
import {
  BOUGHT_LAYER,
  DISCARDED_LAYER,
  HINTS_LAYER,
  NEW_WISH_LAYER,
  hintCount,
} from "../../layers/wishlist-layers/wishlist-layers";

export function Candidates(props: {
  list: CandidateList;
  onBuy: (c: Candidate) => void;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
}) {
  const { list } = props;
  const size = useRowPageSize();
  if (list.candidates.length === 0)
    return <EmptyState title={list.hint.text} description={list.hint.nextAction} />;
  return (
    <>
      <p className="text-sm text-muted-foreground">{list.hint.nextAction}</p>
      <Pager
        items={list.candidates}
        pageSize={size}
        label="Offene Kandidaten"
        getKey={(c) => c.id}
        renderItem={(c, i) => (
          <WishRow
            c={c}
            rank={i + 1}
            onBuy={props.onBuy}
            onDiscard={props.onDiscard}
            busy={props.busy}
          />
        )}
      />
    </>
  );
}

/** One row of controls: the one primary action and the layers with the rest, each with its count (US-QS-22). */
export function Controls(props: { data: Wishlist }) {
  const { data } = props;
  const create = useLayer(NEW_WISH_LAYER);
  const hints = hintCount(data.list);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        aria-haspopup="dialog"
        onClick={(e) => create.openLayer(e.currentTarget)}
      >
        Wunsch erfassen
      </Button>
      {hints > 0 ? <LayerOpener id={HINTS_LAYER}>{`Hinweise (${hints})`}</LayerOpener> : null}
      {data.bought.bought.length > 0 ? (
        <LayerOpener id={BOUGHT_LAYER}>{`Gekauft (${data.bought.bought.length})`}</LayerOpener>
      ) : null}
      {data.discarded.discarded.length > 0 ? (
        <LayerOpener id={DISCARDED_LAYER}>
          {`Verworfen (${data.discarded.discarded.length})`}
        </LayerOpener>
      ) : null}
    </div>
  );
}
