import type { PlantSlots } from "@/collection";
import { PlantCare, PlantGrowth, PlantHistory } from "@/care";
import { WaterAction } from "@/monitoring";

type Token = () => Promise<string | undefined>;

/**
 * The parts of the plant layer that belong to other modules (US-QS-23): the growth trend, the history and the care of
 * `care`, and the button "Gießen" of `monitoring`. The modules do not know each other, so the app hands them to the
 * `collection` as slots; each one is a lazy part that loads when its tab opens.
 */
export function plantSlots(api: string, token: Token): PlantSlots {
  return {
    growth: (card) => <PlantGrowth api={api} token={token} specimenId={card.id} />,
    history: (card, ctx) => (
      <PlantHistory api={api} token={token} specimenId={card.id} onMeasure={ctx.measure} />
    ),
    care: (card) => (
      <PlantCare api={api} token={token} specimen={{ id: card.id, name: card.name }} />
    ),
    water: (card) => (
      <WaterAction api={api} token={token} specimen={{ id: card.id, name: card.name }} />
    ),
  };
}
