import type { Candidate, CandidateList } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { LayerOpener, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Wishlist } from "../../../wishlist-api";
import table from "../../../wishlist.de.json";
import { WishRow } from "../../rows/wish-row/wish-row";
import {
  BOUGHT_LAYER,
  DISCARDED_LAYER,
  HINTS_LAYER,
  NEW_WISH_LAYER,
  hintCount,
} from "../../layers/wishlist-layers/wishlist-layers";

const t = texts(table);

export function Candidates(props: {
  list: CandidateList;
  onBuy: (c: Candidate) => void;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
}) {
  const { list } = props;
  // The starting value until the layout measures the free height; then the page holds the whole rows that fit (issue 1154).
  const size = useRowPageSize();
  if (list.candidates.length === 0)
    return <EmptyState title={list.hint.text} description={list.hint.nextAction} />;
  return (
    <>
      <p className="text-sm text-muted-foreground">{list.hint.nextAction}</p>
      <Pager
        items={list.candidates}
        pageSize={size}
        fit
        label={t("candidates.label")}
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
        {t("controls.create")}
      </Button>
      {hints > 0 ? (
        <LayerOpener id={HINTS_LAYER}>{t("controls.hints", { count: hints })}</LayerOpener>
      ) : null}
      {data.bought.bought.length > 0 ? (
        <LayerOpener id={BOUGHT_LAYER}>
          {t("controls.bought", { count: data.bought.bought.length })}
        </LayerOpener>
      ) : null}
      {data.discarded.discarded.length > 0 ? (
        <LayerOpener id={DISCARDED_LAYER}>
          {t("controls.discarded", { count: data.discarded.discarded.length })}
        </LayerOpener>
      ) : null}
    </div>
  );
}
