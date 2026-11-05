import type { Species, Specimen } from "@pflanzendex/core";
import type { Host } from "../specimens/hooks/use-collection";
import type { Token } from "../specimens/hooks/use-collection";
import type { ReactNode } from "react";
import type { PlantSlots } from "../plants-screen/plant-layers/layer-ids";

// The props of the collection page, shared by the page and the views it shows.
export type Props = {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onAdd?: () => void; // quick flow for a further plant instead of the catalog (US-ONB-01)
  onCompleted: (specimen: Specimen) => void;
  onMeasure?: (e: { id: string; name: string }) => void;
  /** Set when the destination "Sammlung" shows the page below its title: demoted heading, count line (US-QS-14). */
  host?: Host;
  /** Opens the management of locations and light zones from the layers of the plants (US-QS-19). */
  onManage?: () => void;
  groupBy?: "location"; // grouping by location and zone (US-QS-14)
  renderHint?: (applicable: readonly string[]) => ReactNode; // calm hint (US-ONB-07)
  /** Parts of the plant layer that belong to other modules, wired by the app (US-QS-23). */
  plantSlots?: PlantSlots;
};
