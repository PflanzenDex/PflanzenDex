import { Button } from "@/components/ui/button/button";
import { TYPE_LABELS } from "../../labels";
import { WishForm } from "./wish-form/wish-form";
import type { EquipmentWishInput, EquipmentWishList, EquipmentWishRow } from "./wishes-api";

export interface WishActions {
  busy: boolean;
  /** Resolves true when the wish was saved, so the form can be emptied. */
  onCreate: (input: EquipmentWishInput) => Promise<boolean>;
  onBuy: (wish: EquipmentWishRow) => void;
  onDiscard: (wish: EquipmentWishRow) => void;
}

const UNKNOWN = "unbekannt";
const price = (w: EquipmentWishRow) =>
  w.priceEur === null ? UNKNOWN : `${w.priceEur.toFixed(2).replace(".", ",")} €`;

function Group(props: {
  title: string;
  items: readonly EquipmentWishRow[];
  actions?: WishActions;
}) {
  if (props.items.length === 0) return null;
  return (
    <>
      <h3 className="mt-2 font-semibold">{props.title}</h3>
      <ul
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={props.title}
      >
        {props.items.map((w) => (
          <li key={w.id} className="min-w-0 rounded-lg border border-border p-3">
            <p className="m-0 break-words font-semibold">{w.name}</p>
            <p className="m-0 text-sm text-muted-foreground">
              {TYPE_LABELS[w.equipmentType]} · Produkt-ID {w.productId ?? UNKNOWN} · Preis{" "}
              {price(w)}
            </p>
            {props.actions ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="touch"
                  disabled={props.actions.busy}
                  onClick={() => props.actions?.onBuy(w)}
                >
                  {`Gekauft: ${w.name}`}
                </Button>
                <Button
                  size="touch"
                  variant="outline"
                  disabled={props.actions.busy}
                  onClick={() => props.actions?.onDiscard(w)}
                >
                  {`Verwerfen: ${w.name}`}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The equipment wishes (US-EQU-08): wishes of type equipment next to the plant wishes, counted apart from them, so the
 * buffer and the zone hints of the plants stay as they are. "Gekauft" opens the equipment form with name, product id,
 * type and price filled in; a missing price stays unknown (P-08).
 */
export function WishesView(props: { wishes: EquipmentWishList; actions: WishActions }) {
  const { wishes, actions } = props;
  const count = wishes.open.length;
  return (
    <section aria-labelledby="equipment-wishes-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-wishes-title" className="text-xl font-semibold">
        Equipment-Wünsche
      </h2>
      <p className="m-0 text-muted-foreground">
        {count === 0
          ? "Kein offener Equipment-Wunsch. Erfasse unten, was du dir wünschst; die Pflanzenwünsche bleiben getrennt."
          : `${count === 1 ? "1 offener Equipment-Wunsch" : `${count} offene Equipment-Wünsche`}, getrennt von den Pflanzenwünschen gezählt.`}
      </p>
      <Group title="Offene Equipment-Wünsche" items={wishes.open} actions={actions} />
      <Group title="Gekaufte Equipment-Wünsche" items={wishes.bought} />
      <Group title="Verworfene Equipment-Wünsche" items={wishes.discarded} />
      <WishForm busy={actions.busy} onCreate={actions.onCreate} />
    </section>
  );
}
