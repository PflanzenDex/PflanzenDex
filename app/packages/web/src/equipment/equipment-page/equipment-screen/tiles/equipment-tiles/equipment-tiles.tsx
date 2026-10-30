import { equipmentCosts } from "@pflanzendex/core";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import type { EquipmentData } from "../../../../equipment-api";

export const ITEMS_LAYER = "items";
export const COSTS_LAYER = "costs";
export const NEEDS_LAYER = "needs";
export const LAMPS_LAYER = "lamps";
export const SENSORS_LAYER = "sensors";
export const WISHES_LAYER = "wishes";
export const NEW_LAYER = "new";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Tile(props: { id: string; name: string; info: string }) {
  return (
    <LayerOpener
      id={props.id}
      className="h-auto w-full flex-col items-start gap-0 whitespace-normal px-3 py-2 text-left"
    >
      <span className="font-semibold">{props.name}</span>
      <span className="text-sm font-normal text-muted-foreground">{props.info}</span>
    </LayerOpener>
  );
}

/**
 * The parts of the equipment as tiles with their counts (US-QS-22): what I own, the costs, what is missing, the lamps with
 * their zones and light, the sensors and the equipment wishes. Each opens its layer. The costs read "unbekannt" where no
 * price is known, never 0 (P-08).
 */
export function EquipmentTiles({ data }: { data: EquipmentData }) {
  const sum = equipmentCosts(data.items).total.sumEur;
  const lamps = data.light.lamps.length + data.zones.unassigned.length;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <Tile id={ITEMS_LAYER} name="Equipment" info={count(data.items.length, "Teil", "Teile")} />
      <Tile
        id={COSTS_LAYER}
        name="Kosten"
        info={sum === null ? "unbekannt" : `${sum.toFixed(2).replace(".", ",")} €`}
      />
      <Tile
        id={NEEDS_LAYER}
        name="Bedarf"
        info={data.needs.length === 0 ? "nichts fehlt" : `${data.needs.length} offen`}
      />
      <Tile id={LAMPS_LAYER} name="Lampen und Zonen" info={count(lamps, "Lampe", "Lampen")} />
      <Tile
        id={SENSORS_LAYER}
        name="Sensoren"
        info={count(data.sensors.sensors.length, "Sensor", "Sensoren")}
      />
      <Tile
        id={WISHES_LAYER}
        name="Wünsche"
        info={count(data.wishes.open.length, "offener", "offene")}
      />
    </div>
  );
}
