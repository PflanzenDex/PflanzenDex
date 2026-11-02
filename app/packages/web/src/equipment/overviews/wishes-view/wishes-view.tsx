import { useState } from "react";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { Button } from "@/components/ui/button/button";
import { texts } from "@/lib/text-rules/texts";
import table from "../../equipment.de.json";
import { TYPE_LABELS } from "../../labels";
import type { EquipmentWishInput, EquipmentWishList, EquipmentWishRow } from "./wishes-api";

const t = texts(table);

export interface WishActions {
  busy: boolean;
  /** Resolves true when the wish was saved, so the form can be emptied. */
  onCreate: (input: EquipmentWishInput) => Promise<boolean>;
  onBuy: (wish: EquipmentWishRow) => void;
  onDiscard: (wish: EquipmentWishRow) => void;
}

/** The layer with the form of a new equipment wish (`?sheet=new-equipment-wish`, issue 1154). */
export const NEW_WISH_LAYER = "new-equipment-wish";

type Group = "open" | "bought" | "discarded";
const GROUPS: readonly Group[] = ["open", "bought", "discarded"];
/** Wishes per page until the layout measures the free height (starting value, assumption; issue 1154). */
const PAGE_SIZE = 2;

const price = (w: EquipmentWishRow) =>
  w.priceEur === null ? t("wishes.unknown") : `${w.priceEur.toFixed(2).replace(".", ",")} €`;

function WishCard(props: { wish: EquipmentWishRow; actions?: WishActions | undefined }) {
  const { wish: w, actions } = props;
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <p className="m-0 break-words font-semibold">{w.name}</p>
      <p className="m-0 text-sm text-muted-foreground">
        {t("wishes.facts", {
          type: TYPE_LABELS[w.equipmentType],
          productId: w.productId ?? t("wishes.unknown"),
          price: price(w),
        })}
      </p>
      {actions ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="touch" disabled={actions.busy} onClick={() => actions.onBuy(w)}>
            {t("wishes.buy", { name: w.name })}
          </Button>
          <Button
            size="touch"
            variant="outline"
            disabled={actions.busy}
            onClick={() => actions.onDiscard(w)}
          >
            {t("wishes.discard", { name: w.name })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The equipment wishes (US-EQU-08): wishes of type equipment next to the plant wishes, counted apart from them, so the
 * buffer and the zone hints of the plants stay as they are. "Gekauft" opens the equipment form with name, product id,
 * type and price filled in; a missing price stays unknown (P-08). On one screen (US-QS-15, issue 1154): a segment shows
 * one group, paged by the free height of the layer, and the form is a layer of its own.
 */
export function WishesView(props: { wishes: EquipmentWishList; actions: WishActions }) {
  const { wishes, actions } = props;
  const [group, setGroup] = useState<Group>("open");
  const count = wishes.open.length;
  const items = wishes[group];
  return (
    <section
      aria-labelledby="equipment-wishes-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      {/* The layer title names the part, so the heading is only for screen readers (US-QS-18, A-05). */}
      <h2 id="equipment-wishes-title" className="sr-only">
        {t("wishes.title")}
      </h2>
      <p className="m-0 text-muted-foreground">
        {count === 0
          ? t("wishes.none")
          : count === 1
            ? t("wishes.count.one")
            : t("wishes.count.other", { count })}
      </p>
      <SegmentedControl
        label={t("wishes.groups")}
        options={GROUPS.map((g) => ({
          value: g,
          label: t(`wishes.group.${g}`, { count: wishes[g].length }),
        }))}
        value={group}
        onChange={setGroup}
      />
      {items.length === 0 ? (
        // No open wish is said by the line above already; the other groups say they are empty.
        group === "open" ? null : (
          <p className="m-0 text-muted-foreground">
            {t(group === "bought" ? "wishes.empty.bought" : "wishes.empty.discarded")}
          </p>
        )
      ) : (
        <Pager
          items={items}
          pageSize={PAGE_SIZE}
          fit
          label={t(`wishes.list.${group}`)}
          param={LAYER_PARAM}
          replace
          resetKey={group}
          getKey={(w) => w.id}
          renderItem={(w) => <WishCard wish={w} actions={group === "open" ? actions : undefined} />}
        />
      )}
      <LayerOpener id={NEW_WISH_LAYER} className="self-start">
        {t("wishes.create")}
      </LayerOpener>
    </section>
  );
}
