import { Suspense, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { Menu, type MenuItem } from "@/shared/patterns/display/panels/menu/menu";
import { Tabs } from "@/shared/patterns/display/panels/tabs/tabs";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { Measurement } from "../../../specimens/cards/specimen-card/specimen-card";
import { plantLayerId } from "../../rows/plant-tile/plant-tile";
import type { Handlers, LayerProps, SlotRender } from "../layer-ids";
import table from "../plant-layers.de.json";
import { PlantCareTab } from "./plant-care-tab/plant-care-tab";
import { PlantLocation } from "./plant-location/plant-location";
import { Chips, MeasureButton, PlantOverview } from "./plant-overview/plant-overview";
import { PlantSlotSkeleton, type SlotPart } from "./plant-layer.skeleton";

const t = texts(table);
const TAB_PARAM = "tab";
/** The status names of a plant and a cutting, compared as values (FR-QG-12); a cutting gets no repot plan (US-BES-04). */
const PLANT_STATUS = "plant" as const;
const CUTTING_STATUS = "cutting" as const;
/** The tabs and their values in the address (`&tab=`); an absent or unknown value means the overview (US-QS-23). */
const TABS = [
  { value: "ueberblick", label: t("tabs.overview") },
  { value: "verlauf", label: t("tabs.history") },
  { value: "pflege", label: t("tabs.care") },
  { value: "standort", label: t("tabs.location") },
] as const;

/**
 * The active tab, kept in the address. A tab change replaces the entry instead of pushing one, so Back closes the layer
 * in one step (`useLayer`) and a reload or a copied link opens the same tab.
 */
export function usePlantTab() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get(TAB_PARAM);
  const tab = TABS.find((t) => t.value === raw)?.value ?? TABS[0].value;
  const choose = (value: string) => {
    const next = new URLSearchParams(params);
    next.set(TAB_PARAM, value);
    setParams(next, { replace: true, state: location.state });
  };
  return { tab, choose };
}

/**
 * The rarer actions behind "Mehr": each opens its existing flow; archiving keeps its confirmation (P-10). A form opens
 * its own address (US-QS-15), which replaces this layer: closing the form returns to the list.
 */
function moreItems(card: SpecimenCard, h: Handlers): MenuItem[] {
  const run = (act: ((e: SpecimenCard) => void) | undefined, label: string): MenuItem[] =>
    act ? [{ label, onSelect: () => act(card) }] : [];
  return [
    ...run(h.onRepot, card.status === CUTTING_STATUS ? t("menu.repot") : t("menu.repotPlant")),
    ...run(h.onMark, t("menu.mark")),
    ...run(h.onCatchDate, t("menu.catchDate")),
    ...run(h.onArchive, t("menu.archive")),
  ];
}

/**
 * A part from another module, loaded when its tab opens. While its chunk loads it shows the part's shape (US-QS-14), after
 * the delay, so the layer does not move when the part arrives; a shaped skeleton is never held (DS-57).
 */
function Slot(props: {
  render?: SlotRender | undefined;
  part: SlotPart;
  card: SpecimenCard;
  measure: () => void;
}) {
  if (!props.render) return null;
  return (
    <Suspense fallback={<PlantSlotSkeleton part={props.part} label={t("slot.loading")} />}>
      {props.render(props.card, { measure: props.measure })}
    </Suspense>
  );
}

type Props = Handlers &
  Pick<LayerProps, "slots" | "locations" | "onLocate" | "onManage"> & {
    card: SpecimenCard;
    photoAccess: PhotoAccess;
  };

function tabContents(p: Props, tab: ReturnType<typeof usePlantTab>, close: () => void) {
  const { card } = p;
  const lightZone = p.onLightZone;
  const measure = () => p.onMeasure?.(card);
  const slot = (render: SlotRender | undefined, part: SlotPart) => (
    <Slot render={render} part={part} card={card} measure={measure} />
  );
  const content: Record<(typeof TABS)[number]["value"], ReactNode> = {
    ueberblick: (
      <PlantOverview
        card={card}
        access={p.photoAccess}
        growth={p.slots?.growth ? slot(p.slots.growth, "growth") : undefined}
        water={p.slots?.water ? slot(p.slots.water, "water") : undefined}
        onTreat={() => tab.choose("pflege")}
      />
    ),
    verlauf: p.slots?.history ? slot(p.slots.history, "history") : <Measurement card={card} />,
    pflege: (
      <PlantCareTab
        card={card}
        care={slot(p.slots?.care, "care")}
        repot={
          card.status === PLANT_STATUS && p.onRepot
            ? { access: p.photoAccess, onRepot: () => p.onRepot?.(card) }
            : undefined
        }
      />
    ),
    standort: (
      <PlantLocation
        card={card}
        locations={p.locations}
        onLocate={
          p.onLocate
            ? (locationId, success) => {
                close();
                p.onLocate?.(card.id, locationId, success);
              }
            : undefined
        }
        onLightZone={lightZone ? () => lightZone(card) : undefined}
        onManage={p.onManage}
      />
    ),
  };
  return TABS.map((t) => ({ ...t, content: content[t.value] }));
}

/**
 * One plant as a layer with tabs (US-QS-23, US-QS-15): the name, its chips, the menu "Mehr" with the rarer actions and
 * the tabs "Überblick", "Verlauf", "Pflege" and "Standort". The filled "Messen" sits in the primary slot of the layer
 * and only on the overview; the active tab is in the address.
 */
export function PlantLayer(props: Props) {
  const { card } = props;
  const { closeLayer } = useLayer(plantLayerId(card.id));
  const tab = usePlantTab();
  const items = moreItems(card, props);
  const measure = props.onMeasure;
  return (
    <LayerSheet
      id={plantLayerId(card.id)}
      title={card.name}
      primaryAction={
        tab.tab === "ueberblick" && measure ? (
          <MeasureButton card={card} onMeasure={() => measure(card)} />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Chips card={card} />
          {items.length > 0 ? <Menu label={t("menu.label")} items={items} /> : null}
        </div>
        <Tabs
          label={t("tabs.label")}
          wrap
          tabs={tabContents(props, tab, closeLayer)}
          value={tab.tab}
          onValueChange={tab.choose}
        />
      </div>
    </LayerSheet>
  );
}
