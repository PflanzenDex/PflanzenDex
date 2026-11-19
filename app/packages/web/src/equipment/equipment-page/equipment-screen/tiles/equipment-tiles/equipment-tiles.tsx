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
 * The value of a part is in its row twice, and each copy is shown in one width of the row only (US-QS-32, FX-35 step 5).
 * At least 18 rem (288 px at 100 % text, a 328 px row) it sits at the trailing edge, on the line of the name. Below that
 * (at 200 % text 18 rem is wider than the row) it sits under the name, on the meta line. Only the shown copy is read: text
 * that is display:none is not part of the accessible name, so the name holds the value once.
 */
const BESIDE_THE_NAME = "hidden @min-[18rem]:inline";
const UNDER_THE_NAME = "@min-[18rem]:hidden";

/**
 * The list is the size container (`@container`) of its rows, so the width of a row decides which copy shows. GroupedRow keeps
 * the wrapper of the hidden copy, and its empty flex gap stays: 2 px per row at 100 % text and 24 px of the name's width at
 * 200 % text. Accepted (US-QS-32).
 */
const LIST = "@container";

/**
 * One part of the equipment as one row of the flat grouped list (US-QS-22, US-QS-32, FX-35 step 5): its name, its count or
 * value, and a chevron. Choosing it opens its layer. A view, not an object, so it has no thumbnail. The width of the row
 * decides the shape (the `@container` of the list), so the value does not sit beside a name that is too narrow for it (see
 * BESIDE_THE_NAME).
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
      trailing={<span className={BESIDE_THE_NAME}>{props.info}</span>}
      meta={<span className={UNDER_THE_NAME}>{props.info}</span>}
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
    <GroupedList className={LIST}>
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
