import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { Candidate, CandidateList, ZoneStock } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import type { ApiError } from "../../../../kernel";
import { CandidateCard } from "../../../candidate-card/candidate-card";
import { BoughtList } from "../../../history/bought-list/bought-list";
import { DiscardedList } from "../../../history/discarded-list/discarded-list";
import { DuplicateWishes, type useRepair } from "../../../hints/duplicate-wishes/duplicate-wishes";
import { ReplenishWarning } from "../../../hints/replenish-warning/replenish-warning";
import { UnfitWishes } from "../../../hints/unfit-wishes/unfit-wishes";
import { WishForm } from "../../../wish-form/wish-form";
import type { WishInput, Wishlist } from "../../../wishlist-api";
import type { WishToPlant } from "../../../actions/actions";
import { wishLayerId } from "../../rows/wish-row/wish-row";

export const NEW_WISH_LAYER = "new-wish";
export const BOUGHT_LAYER = "bought";
export const DISCARDED_LAYER = "discarded";
export const HINTS_LAYER = "hints";

type Token = () => Promise<string | undefined>;

/** How many hints the list holds (duplicates, wishes without a fitting zone, zones below the buffer; US-QS-22). */
export function hintCount(list: CandidateList): number {
  return list.duplicates.length + list.unfit.length + list.replenishment.zones.length;
}

function NewWishLayer(props: {
  access: { api: string; token: Token };
  zones: readonly ZoneStock[];
  running: boolean;
  error: ApiError | null;
  onSend: (input: WishInput) => Promise<boolean>;
}) {
  const { closeLayer } = useLayer(NEW_WISH_LAYER);
  return (
    <LayerSheet id={NEW_WISH_LAYER} title="Neuer Wunsch">
      <WishForm
        access={props.access}
        zones={props.zones}
        running={props.running}
        message={null}
        error={props.error}
        onSend={async (input) => {
          const saved = await props.onSend(input);
          // The saved wish is announced on the screen behind; a refusal keeps the layer open at its field (P-10).
          if (saved) closeLayer();
          return saved;
        }}
      />
    </LayerSheet>
  );
}

/**
 * The layers of the wishlist (US-QS-22): the form, the full card of a wish, the bought and the discarded wishes and
 * the hints. Each mounts its content only while it is open.
 */
export function WishlistLayers(props: {
  data: Wishlist;
  access: { api: string; token: Token };
  running: boolean;
  error: ApiError | null;
  onSend: (input: WishInput) => Promise<boolean>;
  card: {
    onBuy: (c: Candidate) => void;
    onDiscard: (c: Candidate) => void;
    onStoreImage: (c: Candidate) => void;
    busy: boolean;
  };
  repair: ReturnType<typeof useRepair>;
  /** The outcome of a repair is shown inside the layer, because the screen behind it is covered (P-10). */
  outcome: ReactNode;
  onCreateSpecimen?: (w: WishToPlant) => void;
}) {
  const [params] = useSearchParams();
  const { data } = props;
  const wish = data.list.candidates.find((c) => wishLayerId(c.id) === params.get("sheet"));
  const create = props.onCreateSpecimen ? { onCreateSpecimen: props.onCreateSpecimen } : {};
  return (
    <>
      <NewWishLayer
        access={props.access}
        zones={data.list.zones}
        running={props.running}
        error={props.error}
        onSend={props.onSend}
      />
      {wish ? (
        <LayerSheet id={wishLayerId(wish.id)} title="Wunsch">
          <ul className="m-0 grid list-none gap-3 p-0">
            <CandidateCard
              c={wish}
              rank={data.list.candidates.indexOf(wish) + 1}
              photoAccess={props.access}
              onStoreImage={props.card.onStoreImage}
              busy={props.card.busy}
            />
          </ul>
        </LayerSheet>
      ) : null}
      <LayerSheet id={BOUGHT_LAYER} title="Gekauft">
        <BoughtList bought={data.bought} {...create} />
      </LayerSheet>
      <LayerSheet id={DISCARDED_LAYER} title="Verworfen">
        <DiscardedList discarded={data.discarded} />
      </LayerSheet>
      <LayerSheet id={HINTS_LAYER} title="Hinweise">
        <div className="flex flex-col gap-4">
          {props.outcome}
          <ReplenishWarning replenishment={data.list.replenishment} />
          <DuplicateWishes list={data.list} repair={props.repair} />
          <UnfitWishes wishes={data.list.unfit} />
        </div>
      </LayerSheet>
    </>
  );
}
