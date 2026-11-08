import { Suspense, useMemo, useState, type ReactNode } from "react";
import { PlantsViewLayer, UnsavedInputDialog, ViewLayer, usePlantForm } from "@/collection";
import { PageSkeleton } from "@/shared/patterns/states/page-skeleton/page-skeleton";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { AreaHeader } from "./area-header/area-header";
import {
  PLANT_GROUPS,
  SPECIES_SORTS,
  useManage,
  usePlantGroup,
  useSammlungView,
  useSpeciesSort,
  type PlantGroup,
} from "../../sammlung-view";
import { ModeBody, type AreaProps } from "./wiring/area-modes/area-modes";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./collection-area.de.json";
import type { FormAddress } from "@/collection";

/** What the shown mode reports to the area: its caption and whether it is a full view with its own heading. */
function useHostState() {
  const [caption, setCaption] = useState<string | null>(null);
  const [fullView, setFullView] = useState(false);
  const host = useMemo(() => ({ onCaption: setCaption, onFullView: setFullView }), []);
  return { caption, fullView, host };
}

/**
 * The destination "Sammlung" (US-QS-14): a switch between the plants (`collection`, with measuring from `care`), the
 * species (`pokedex`, or the comparison by difficulty from `collection`) and the wishlist (`wishlist`). The plants can be
 * grouped by care phase (`care`) or by location, and "Standorte verwalten" opens the locations and light zones (`light`)
 * as a view of its own with a way back. The app wires the modules (they do not know each other); every mode is a lazy
 * part that loads only when it is chosen. The measure view and the forms of a plant are full views with an address
 * (US-QS-15): Back closes them, a reload opens them again, and typed input is asked about before Back leaves it. A form
 * of the collection or the measure view replaces the title area, because it has its own heading and a way back. Every
 * mode is one screen (US-QS-19, issue 1029, US-QS-15): its content takes the free height and scrolls inside the frame.
 */
export function CollectionArea(props: AreaProps) {
  const { view: chosen, choose } = useSammlungView();
  const { sort, choose: chooseSort } = useSpeciesSort();
  const { group, choose: chooseGroup } = usePlantGroup();
  const manage = useManage();
  // A species handed over from the catalog is created in the plants, whatever mode was remembered (US-BES-02).
  const view = props.newSpecies ? "plants" : chosen;
  const plantForm = usePlantForm(props.api, props.token, view === "plants");
  const { form, measureOpen } = plantForm;
  const { caption, fullView, host } = useHostState();
  const managing = view === "plants" && manage.open && !props.newSpecies;
  const own = view === "plants" && (form.kind !== null || fullView || managing);
  const plantsOnScreen = view === "plants" && !own;
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {own ? null : <AreaHeader view={view} caption={caption} onChoose={choose} />}
        <FormFrame form={form}>
          <Suspense fallback={<PageSkeleton />}>
            <ModeBody
              {...props}
              view={view}
              sort={sort}
              group={group}
              managing={managing}
              onCloseManage={() => manage.setOpen(false)}
              onOpenManage={() => manage.setOpen(true)}
              host={host}
              measure={plantForm.measure}
              measureOpen={measureOpen}
              openMeasure={plantForm.openMeasure}
              leaveMeasure={plantForm.leaveMeasure}
              measureSaved={plantForm.measureSaved}
              form={form}
              formPlant={plantForm.formPlant}
            />
          </Suspense>
        </FormFrame>
      </div>
      {plantsOnScreen ? (
        <GroupLayer group={group} onGroup={chooseGroup} onManage={() => manage.setOpen(true)} />
      ) : null}
      {view === "species" ? (
        <ViewLayer
          group={sort}
          options={SPECIES_SORTS}
          onGroup={chooseSort}
          label={t("species.order")}
        />
      ) : null}
      <UnsavedInputDialog open={form.asking} onKeep={form.keepEditing} onDiscard={form.discard} />
    </LayerHost>
  );
}

/**
 * The notice of the last close of a form, and the frame in which input is noted for Back: typed text or a picked file
 * asks before Back leaves the form (US-QS-15).
 */
function FormFrame(p: { form: FormAddress; children: ReactNode }) {
  const { form } = p;
  return (
    <>
      {form.notice ? (
        <Banner variant="warning" className="mb-3">
          {form.notice}
        </Banner>
      ) : null}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        onInput={form.typed}
        onChange={form.typed}
      >
        {p.children}
      </div>
    </>
  );
}

/** The layer "Ansicht" of the plants, loaded with the plants (US-QS-19). */
const t = texts(table);

function GroupLayer(props: {
  group: PlantGroup;
  onGroup: (g: PlantGroup) => void;
  onManage: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <PlantsViewLayer options={PLANT_GROUPS} label={t("plants.groups")} {...props} />
    </Suspense>
  );
}
