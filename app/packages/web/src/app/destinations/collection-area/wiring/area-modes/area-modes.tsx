import type { ReactNode } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import {
  CollectionPage,
  DifficultyPage,
  formText,
  type FormAddress,
  type FormPlant,
} from "@/collection";
import { LightPage } from "@/light";
import { CarePhasesPage, MeasurePage } from "@/care";
import { PokedexPage } from "@/pokedex";
import { WishlistPage, type WishToPlant } from "@/wishlist";
import { EquipmentPage } from "@/equipment";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { plantSlots } from "../plant-slots/plant-slots";
import type { PlantGroup } from "../../../../sammlung-view";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../collection-area.de.json";

const t = texts(table);
/** The modes and arrangements of the area, compared as values (FR-QG-12). */
const MODE = {
  plants: "plants",
  equipment: "equipment",
  wishlist: "wishlist",
  species: "species",
} as const;
const SORT = { difficulty: "difficulty" } as const;
const GROUP = { phase: "phase" } as const;

type Token = () => Promise<string | undefined>;

/** The props of the area as the app wires it (see `CollectionArea`). */
export type AreaProps = {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onAdd?: () => void;
  onCompleted: (specimen: Specimen) => void;
  onOpenSpecies?: (id: string) => void;
  /** Starts the way from a bought wish to its specimen (US-WUN-05); the app wires it. */
  onCreateSpecimen?: (wish: WishToPlant) => void;
  /** The calm hint at the list of plants (US-ONB-07); the app wires it, because the shell is not imported here. */
  renderHint?: (applicable: readonly string[]) => ReactNode;
};

/** What the area passes to the mode it shows: the mode, the arrangement, the plant of the measure view and its forms. */
export type ModeProps = AreaProps & {
  view: "plants" | "species" | "wishlist" | "equipment";
  sort: "pokedex" | "difficulty";
  group: PlantGroup;
  managing: boolean;
  onCloseManage: () => void;
  onOpenManage: () => void;
  host: { onCaption: (t: string | null) => void; onFullView: (open: boolean) => void };
  /** The plant of the measure view, once it is known. */
  measure: { id: string; name: string } | null;
  /** The address names the measure view. */
  measureOpen: boolean;
  openMeasure: (m: { id: string; name: string }) => void;
  leaveMeasure: () => void;
  measureSaved: () => void;
  form: FormAddress;
  formPlant: FormPlant;
};

/** The shown mode of the area: its view, or the list of the plants with its forms (US-QS-14, US-QS-15). */
export function ModeBody(p: ModeProps) {
  const { api, token, host } = p;
  if (p.view === MODE.equipment) return <EquipmentPage api={api} token={token} host={host} />;
  if (p.view === MODE.wishlist)
    return (
      <WishlistPage
        api={api}
        token={token}
        host={host}
        {...(p.onCreateSpecimen ? { onCreateSpecimen: p.onCreateSpecimen } : {})}
      />
    );
  if (p.view === MODE.species)
    return p.sort === SORT.difficulty ? (
      <DifficultyPage api={api} token={token} host={host} />
    ) : (
      <PokedexPage
        api={api}
        token={token}
        host={host}
        {...(p.onOpenSpecies ? { onOpenSpecies: p.onOpenSpecies } : {})}
      />
    );
  if (p.managing)
    return (
      <FullView
        headingId="light-title"
        title={t("manage.title")}
        back={{ label: t("manage.back"), onBack: p.onCloseManage }}
      >
        <LightPage api={api} token={token} onOpenCollection={p.onCloseManage} hosted />
      </FullView>
    );
  if (p.measure)
    return (
      <MeasurePage
        api={api}
        token={token}
        specimen={p.measure}
        onBack={p.leaveMeasure}
        onSaved={p.measureSaved}
      />
    );
  if (p.measureOpen)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {formText("loading")}
      </p>
    );
  if (p.group === GROUP.phase && !p.newSpecies)
    return <CarePhasesPage api={api} token={token} host={host} />;
  return <PlantsMode {...p} />;
}

/** The plants themselves, with the parts of other modules wired into the plant layer (US-QS-23). */
function PlantsMode(p: ModeProps) {
  const { api, token, host } = p;
  const slots = plantSlots(api, token);
  return (
    <CollectionPage
      api={api}
      token={token}
      newSpecies={p.newSpecies}
      onSpeciesChoose={p.onSpeciesChoose}
      {...(p.onAdd ? { onAdd: p.onAdd } : {})}
      onCompleted={p.onCompleted}
      host={host}
      {...(p.renderHint ? { renderHint: p.renderHint } : {})}
      {...(p.group === "location" ? { groupBy: "location" as const } : {})}
      onMeasure={p.openMeasure}
      onManage={p.onOpenManage}
      plantSlots={slots}
      formAddress={p.form}
      formPlant={p.formPlant}
    />
  );
}
