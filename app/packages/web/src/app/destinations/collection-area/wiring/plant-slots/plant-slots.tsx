import type { PlantSlots } from "@/collection";
import { PlantCare, PlantCourse, PlantGrowth, PlantGrowthSkeleton } from "@/care";
import { WaterAction } from "@/monitoring";
import { ContextHint } from "@/app/flows";

type Token = () => Promise<string | undefined>;

/**
 * The parts of the plant layer that belong to other modules (US-QS-23): the growth trend, the history and the care of
 * `care`, and the button "Gießen" of `monitoring`. The modules do not know each other, so the app hands them to the
 * `collection` as slots; each one is a lazy part that loads when its tab opens. The calm hint of the layer (US-ONB-07)
 * is the app's too: one request for the occasions that apply, its note at the place the layer gives it.
 */
export function plantSlots(api: string, token: Token): PlantSlots {
  return {
    hint: ({ applicable, children }) => (
      <ContextHint api={api} token={token} applicable={applicable}>
        {children}
      </ContextHint>
    ),
    // A plant without a measurement reserves one line for its growth line, one with a measurement the longest reading
    // (US-QS-23, US-QS-32): the card knows it before the request, so the first note under "Messen" fits the overview.
    growth: (card) => (
      <PlantGrowth
        api={api}
        token={token}
        specimenId={card.id}
        measured={card.lastMeasurement !== null}
      />
    ),
    // The growth line keeps the height of its loaded line while its chunk loads (US-QS-32, issue 2318).
    growthFallback: (label, card) => (
      <PlantGrowthSkeleton label={label} measured={card.lastMeasurement !== null} />
    ),
    history: (card, ctx) => (
      <PlantCourse api={api} token={token} specimenId={card.id} onMeasure={ctx.measure} />
    ),
    care: (card) => (
      <PlantCare api={api} token={token} specimen={{ id: card.id, name: card.name }} />
    ),
    water: (card) => (
      <WaterAction api={api} token={token} specimen={{ id: card.id, name: card.name }} />
    ),
  };
}
