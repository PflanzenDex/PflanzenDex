import { Suspense, useMemo, useState, type ReactNode } from "react";
import type { Species, Specimen } from "@pflanzendex/core";
import { CollectionPage, DifficultyPage } from "@/collection";
import { LightPage } from "@/light";
import { CarePhasesPage, MeasurePage } from "@/care";
import { PokedexPage } from "@/pokedex";
import { WishlistPage, type WishToPlant } from "@/wishlist";
import { EquipmentPage } from "@/equipment";
import { PageSkeleton } from "@/components/shared/states/page-skeleton/page-skeleton";
import { SammlungHeader } from "@/components/sammlung-header/sammlung-header";
import { PlantControls } from "@/components/sammlung-header/plant-controls/plant-controls";
import { Button } from "@/components/ui/button/button";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import {
  PLANT_GROUPS,
  SAMMLUNG_VIEWS,
  SPECIES_SORTS,
  useManage,
  usePlantGroup,
  useSammlungView,
  useSpeciesSort,
  type PlantGroup,
} from "../../../../sammlung-view";

type Token = () => Promise<string | undefined>;

/**
 * The destination "Sammlung" (US-QS-14): a switch between the plants (`collection`, with measuring from `care`), the
 * species (`pokedex`, or the comparison by difficulty from `collection`) and the wishlist (`wishlist`). The plants can be
 * grouped by care phase (`care`) or by location, and "Standorte verwalten" opens the locations and light zones (`light`)
 * as a view of its own with a way back. The app wires
 * the modules (they do not know each other); every mode is a lazy part that loads only when it is chosen. The specimen
 * currently being measured is remembered by this area (US-WAC-01). A form of the collection or the measure view
 * replaces the title area, because it has its own heading and a way back.
 */
export function CollectionArea(props: {
  api: string;
  token: Token;
  newSpecies: Species | null;
  onSpeciesChoose: () => void;
  onCompleted: (specimen: Specimen) => void;
  onOpenSpecies?: (id: string) => void;
  /** Starts the way from a bought wish to its specimen (US-WUN-05); the app wires it. */
  onCreateSpecimen?: (wish: WishToPlant) => void;
  /** The calm hint at the list of plants (US-ONB-07); the app wires it, because the shell is not imported here. */
  renderHint?: (applicable: readonly string[]) => ReactNode;
  /** The locked parts inside this destination (US-ONB-05): wishlist and equipment; the app wires it. */
  locks?: (ids: readonly string[]) => ReactNode;
}) {
  const { view: chosen, choose } = useSammlungView();
  const { sort, choose: chooseSort } = useSpeciesSort();
  const { group, choose: chooseGroup } = usePlantGroup();
  const manage = useManage();
  // A species handed over from the catalog is created in the plants, whatever mode was remembered (US-BES-02).
  const view = props.newSpecies ? "plants" : chosen;
  const [measure, setMeasure] = useState<{ id: string; name: string } | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [fullView, setFullView] = useState(false);
  const host = useMemo(() => ({ onCaption: setCaption, onFullView: setFullView }), []);
  const managing = view === "plants" && manage.open && !props.newSpecies;
  const own = view === "plants" && (measure !== null || fullView || managing);
  return (
    <>
      {own ? null : (
        <SammlungHeader view={view} options={SAMMLUNG_VIEWS} onChoose={choose} caption={caption}>
          {view === "species" ? (
            <SegmentedControl
              label="Anordnung der Arten"
              options={SPECIES_SORTS}
              value={sort}
              onChange={chooseSort}
            />
          ) : null}
          {view === "plants" ? (
            <PlantControls
              group={group}
              options={PLANT_GROUPS}
              onGroup={chooseGroup}
              onManage={() => manage.setOpen(true)}
            />
          ) : null}
        </SammlungHeader>
      )}
      <Suspense fallback={<PageSkeleton />}>
        <Mode
          {...props}
          view={view}
          sort={sort}
          group={group}
          managing={managing}
          onCloseManage={() => manage.setOpen(false)}
          host={host}
          measure={measure}
          setMeasure={setMeasure}
        />
      </Suspense>
    </>
  );
}

/** The locked modes of the destination (US-ONB-05): wishlist and equipment stay visible with reason and way. */
function LockedModes(props: { locks: ((ids: readonly string[]) => ReactNode) | undefined }) {
  return props.locks ? (
    <Suspense fallback={null}>{props.locks(["wishlist", "equipment"])}</Suspense>
  ) : null;
}

type ModeProps = Parameters<typeof CollectionArea>[0] & {
  view: "plants" | "species" | "wishlist" | "equipment";
  sort: "pokedex" | "difficulty";
  group: PlantGroup;
  managing: boolean;
  onCloseManage: () => void;
  host: { onCaption: (t: string | null) => void; onFullView: (open: boolean) => void };
  measure: { id: string; name: string } | null;
  setMeasure: (m: { id: string; name: string } | null) => void;
};

/** The locked modes, then the page of the chosen mode. */
function Mode(p: ModeProps) {
  return (
    <>
      {p.measure || p.managing ? null : <LockedModes locks={p.locks} />}
      <ModeBody {...p} />
    </>
  );
}

function ModeBody(p: ModeProps) {
  const { api, token, host } = p;
  if (p.view === "equipment") return <EquipmentPage api={api} token={token} host={host} />;
  if (p.view === "wishlist")
    return (
      <WishlistPage
        api={api}
        token={token}
        host={host}
        {...(p.onCreateSpecimen ? { onCreateSpecimen: p.onCreateSpecimen } : {})}
      />
    );
  if (p.view === "species")
    return p.sort === "difficulty" ? (
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
      <div className="flex min-w-0 flex-col gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={p.onCloseManage}
        >
          Zurück zur Sammlung
        </Button>
        <LightPage api={api} token={token} onOpenCollection={p.onCloseManage} />
      </div>
    );
  if (p.measure)
    return (
      <MeasurePage api={api} token={token} specimen={p.measure} onBack={() => p.setMeasure(null)} />
    );
  if (p.group === "phase" && !p.newSpecies)
    return <CarePhasesPage api={api} token={token} host={host} />;
  return (
    <CollectionPage
      api={api}
      token={token}
      newSpecies={p.newSpecies}
      onSpeciesChoose={p.onSpeciesChoose}
      onCompleted={p.onCompleted}
      host={host}
      {...(p.renderHint ? { renderHint: p.renderHint } : {})}
      {...(p.group === "location" ? { groupBy: "location" as const } : {})}
      onMeasure={p.setMeasure}
    />
  );
}
