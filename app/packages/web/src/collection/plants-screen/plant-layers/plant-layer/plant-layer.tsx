import type { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { Menu, type MenuItem } from "@/shared/patterns/display/panels/menu/menu";
import { Tabs } from "@/shared/patterns/display/panels/tabs/tabs";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { Measurement } from "../../../specimens/cards/specimen-card/specimen-card";
import {
  PLANT_LOCATION_TAB,
  PLANT_TAB_PARAM,
  plantLayerId,
} from "@/shared/patterns/navigation/navigation/navigation";
import type { Handlers, LayerProps, PlantNote, SlotFallback, SlotRender } from "../layer-ids";
import table from "../plant-layers.de.json";
import { PlantCareTab } from "./plant-care-tab/plant-care-tab";
import { PlantLocation } from "./plant-location/plant-location";
import { Chips, PlantOverview } from "./plant-overview/plant-overview";
import { QuickActions } from "./plant-overview/quick-actions/quick-actions";
import type { SlotPart } from "./plant-layer.skeleton";
import { HistoryTab, Slot } from "./plant-layer.slot";

const t = texts(table);
/** The status names of a plant and a cutting, compared as values (FR-QG-12); a cutting gets no repot plan (US-BES-04). */
const PLANT_STATUS = "plant" as const;
const CUTTING_STATUS = "cutting" as const;
/**
 * The tabs and their values in the address (`&tab=`, `PLANT_TAB_PARAM`); an absent or unknown value means the overview
 * (US-QS-23). The Standort value is shared with the care rows that open it (`PLANT_LOCATION_TAB`, US-QS-32).
 */
const TABS = [
  { value: "ueberblick", label: t("tabs.overview") },
  { value: "verlauf", label: t("tabs.history") },
  { value: "pflege", label: t("tabs.care") },
  { value: PLANT_LOCATION_TAB[PLANT_TAB_PARAM], label: t("tabs.location") },
] as const;

/**
 * The active tab, kept in the address. A tab change replaces the entry instead of pushing one, so Back closes the layer
 * in one step (`useLayer`) and a reload or a copied link opens the same tab.
 */
export function usePlantTab() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get(PLANT_TAB_PARAM);
  const tab = TABS.find((t) => t.value === raw)?.value ?? TABS[0].value;
  const choose = (value: string) => {
    const next = new URLSearchParams(params);
    next.set(PLANT_TAB_PARAM, value);
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

type Props = Handlers &
  Pick<LayerProps, "slots" | "hintOccasions" | "locations" | "onLocate" | "onManage"> & {
    card: SpecimenCard;
    photoAccess: PhotoAccess;
  };

function tabContents(
  p: Props,
  tab: ReturnType<typeof usePlantTab>,
  close: () => void,
  note: PlantNote,
) {
  const { card } = p;
  const lightZone = p.onLightZone;
  const measure = () => p.onMeasure?.(card);
  const slot = (
    render: SlotRender | undefined,
    part: SlotPart,
    fallback?: SlotFallback | undefined,
  ) => <Slot render={render} part={part} fallback={fallback} card={card} measure={measure} />;
  const history = p.slots?.history ? slot(p.slots.history, "history") : <Measurement card={card} />;
  const content: Record<(typeof TABS)[number]["value"], ReactNode> = {
    ueberblick: (
      <PlantOverview
        card={card}
        access={p.photoAccess}
        growth={
          p.slots?.growth ? slot(p.slots.growth, "growth", p.slots.growthFallback) : undefined
        }
        onTreat={() => tab.choose("pflege")}
      />
    ),
    verlauf: <HistoryTab note={note("first_measurement")}>{history}</HistoryTab>,
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

/** A layer without a hint host: no note is ever due, every place stays as it is (US-ONB-07). */
const NO_NOTE: PlantNote = () => null;

/**
 * One plant as a layer with tabs (US-QS-23, US-QS-15): the name, the quick actions under it (only on the overview, owner
 * decision 2026-11-22, issue 2424), its chips, the menu "Mehr" with the rarer actions and the tabs "Überblick", "Verlauf", "Pflege"
 * and "Standort". The active tab is in the address. The calm notes (US-ONB-07) stand under the quick actions and first in "Verlauf".
 */
function PlantLayerSheet(props: Props & { note: PlantNote }) {
  const { card, note } = props;
  const { closeLayer } = useLayer(plantLayerId(card.id));
  const tab = usePlantTab();
  const items = moreItems(card, props);
  const measure = props.onMeasure;
  const water = props.slots?.water;
  return (
    <LayerSheet
      id={plantLayerId(card.id)}
      title={card.name}
      topAction={
        tab.tab === "ueberblick" ? (
          <QuickActions
            card={card}
            onMeasure={measure ? () => measure(card) : undefined}
            onPhoto={measure ? () => measure(card, { photo: true }) : undefined}
            water={
              water ? (
                <Slot render={water} part="water" card={card} measure={() => measure?.(card)} />
              ) : undefined
            }
            note={note("first_plant_saved")}
          />
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
          tabs={tabContents(props, tab, closeLayer, note)}
          value={tab.tab}
          onValueChange={tab.choose}
        />
      </div>
    </LayerSheet>
  );
}

/**
 * The plant layer with its calm hint (US-ONB-07): the app's hint host asks once for the occasions that apply and gives
 * the note of each occasion to its place in the layer. Without a host the layer shows as before.
 */
export function PlantLayer(props: Props) {
  const hint = props.slots?.hint;
  const body = (note: PlantNote) => <PlantLayerSheet {...props} note={note} />;
  return hint ? hint({ applicable: props.hintOccasions ?? [], children: body }) : body(NO_NOTE);
}
