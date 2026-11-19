import { equipmentCosts } from "@pflanzendex/core";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { layerOpenerId } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import type { EquipmentData } from "../../../../equipment-api";

export const ITEMS_LAYER = "items";
export const COSTS_LAYER = "costs";
export const NEEDS_LAYER = "needs";
export const LAMPS_LAYER = "lamps";
export const SENSORS_LAYER = "sensors";
export const WISHES_LAYER = "wishes";
export const NEW_LAYER = "new";

const count = (n: number, one: string, many: string) => `${n}\u00a0${n === 1 ? one : many}`;

/**
 * One part of the equipment as one line of the flat grouped list (US-QS-22, US-QS-32, FX-35 step 5): its name, then its count
 * or value at the trailing edge, and a chevron. Choosing it opens its layer. A view, not an object, so it has no thumbnail.
 * One line keeps six parts within 360 x 640 px (the page fits one screen, US-QS-22).
 */
function Part(props: { id: string; name: string; info: string }) {
  const { openLayer, open } = useLayer(props.id);
  return (
    <GroupedRow
      id={layerOpenerId(props.id)}
      onClick={(event) => openLayer(event.currentTarget)}
      haspopup="dialog"
      expanded={open}
      title={props.name}
      trailing={props.info}
    />
  );
}

/**
 * The parts of the equipment as one grouped list with their counts (US-QS-22, US-QS-32): what I own, the costs, what is
 * missing, the lamps with their zones and light, the sensors and the equipment wishes. Each row opens its layer. The costs
 * read "unbekannt" where no price is known, never 0 (P-08).
 */
export function EquipmentTiles({ data }: { data: EquipmentData }) {
  const sum = equipmentCosts(data.items).total.sumEur;
  const lamps = data.light.lamps.length + data.zones.unassigned.length;
  return (
    <GroupedList>
      <Part id={ITEMS_LAYER} name="Geräte" info={count(data.items.length, "Gerät", "Geräte")} />
      <Part
        id={COSTS_LAYER}
        name="Kosten"
        info={sum === null ? "unbekannt" : `${sum.toFixed(2).replace(".", ",")} €`}
      />
      <Part
        id={NEEDS_LAYER}
        name="Bedarf"
        info={data.needs.length === 0 ? "nichts fehlt" : `${data.needs.length} offen`}
      />
      <Part id={LAMPS_LAYER} name="Lampen und Zonen" info={count(lamps, "Lampe", "Lampen")} />
      <Part
        id={SENSORS_LAYER}
        name="Sensoren"
        info={count(data.sensors.sensors.length, "Sensor", "Sensoren")}
      />
      <Part
        id={WISHES_LAYER}
        name="Geräte-Wünsche"
        info={count(data.wishes.open.length, "offener Wunsch", "offene Wünsche")}
      />
    </GroupedList>
  );
}
