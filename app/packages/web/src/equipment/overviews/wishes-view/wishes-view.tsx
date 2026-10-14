import { useState, type FormEvent } from "react";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { TYPE_LABELS } from "../../labels";
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

/** The form input of a wish: empty fields stay out (unknown, P-08); a price takes a comma or a point. */
function toInput(f: { type: string; name: string; productId: string; price: string }) {
  const priceText = f.price.trim().replace(",", ".");
  return {
    equipmentType: f.type,
    name: f.name.trim(),
    ...(f.productId.trim() ? { productId: f.productId.trim() } : {}),
    ...(priceText ? { priceEur: Number(priceText) } : {}),
  };
}

function WishForm(props: { actions: WishActions }) {
  const [f, setF] = useState({ type: "", name: "", productId: "", price: "" });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((old) => ({ ...old, [key]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await props.actions.onCreate(toInput(f)))
      setF({ type: "", name: "", productId: "", price: "" });
  };
  return (
    <form
      onSubmit={submit}
      className="flex max-w-xl flex-col gap-3"
      aria-label="Equipment-Wunsch erfassen"
    >
      <label className="flex flex-col gap-1">
        Art des Wunsches
        <Select value={f.type} onChange={set("type")} required>
          <option value="">Bitte wählen</option>
          {EQUIPMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        Name des Wunsches
        <Input
          value={f.name}
          onChange={set("name")}
          maxLength={EQUIPMENT_LIMITS.name.max}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Produkt-ID des Wunsches (optional)
        <Input
          value={f.productId}
          onChange={set("productId")}
          maxLength={EQUIPMENT_LIMITS.productId.max}
        />
      </label>
      <label className="flex flex-col gap-1">
        Geplanter Preis in Euro (optional)
        <Input value={f.price} onChange={set("price")} inputMode="decimal" />
      </label>
      <Button type="submit" size="touch" disabled={props.actions.busy}>
        Wunsch speichern
      </Button>
    </form>
  );
}

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
      <WishForm actions={actions} />
    </section>
  );
}
