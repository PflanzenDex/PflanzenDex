import { Suspense, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { Menu, type MenuItem } from "@/components/data-display/panels/menu/menu";
import { Tabs } from "@/components/data-display/panels/tabs/tabs";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Badge } from "@/components/ui/display/badge/badge";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { Measurement } from "../../../specimens/cards/specimen-card/specimen-card";
import { plantLayerId } from "../../rows/plant-tile/plant-tile";
import type { Handlers, LayerProps, SlotRender } from "../layer-ids";
import { PlantCareTab } from "./plant-care-tab/plant-care-tab";
import { PlantLocation } from "./plant-location/plant-location";
import { MeasureButton, PlantOverview } from "./plant-overview/plant-overview";

const TAB_PARAM = "tab";
/** The tabs and their values in the address (`&tab=`); an absent or unknown value means the overview (US-QS-23). */
const TABS = [
  { value: "ueberblick", label: "Überblick" },
  { value: "verlauf", label: "Verlauf" },
  { value: "pflege", label: "Pflege" },
  { value: "standort", label: "Standort" },
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

/** An action of the layer closes the layer first, so the result or the form is not hidden behind it (P-10). */
function closing<E>(
  close: () => void,
  act: ((e: E) => void) | undefined,
): ((e: E) => void) | undefined {
  return act
    ? (e) => {
        close();
        act(e);
      }
    : undefined;
}

/** Light zone, location and the open treatment as text chips (P-08: unknown reads as such). */
function Chips({ card }: { card: SpecimenCard }) {
  return (
    <ul aria-label="Auf einen Blick" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      <li>
        <Badge variant="outline">{card.lightZone ?? "Zone unbekannt"}</Badge>
      </li>
      <li>
        <Badge variant="outline">{card.location ?? "Standort unbekannt"}</Badge>
      </li>
      {card.treatment ? (
        <li>
          <Badge variant="warning">Behandeln</Badge>
        </li>
      ) : null}
    </ul>
  );
}

/** The rarer actions behind "Mehr": each opens its existing flow; archiving keeps its confirmation (P-10). */
function moreItems(card: SpecimenCard, h: Handlers, close: () => void): MenuItem[] {
  const run = (act: ((e: SpecimenCard) => void) | undefined, label: string): MenuItem[] =>
    act ? [{ label, onSelect: () => closing(close, act)?.(card) }] : [];
  return [
    ...run(card.status === "cutting" ? h.onRepot : undefined, "Eingetopft"),
    ...run(h.onMark, "Kennzeichen"),
    ...run(h.onCatchDate, "Fangdatum"),
    ...run(h.onArchive, "Archivieren"),
  ];
}

/** A part from another module, loaded when its tab opens; it says that it is loading (P-10). */
function Slot(props: { render?: SlotRender | undefined; card: SpecimenCard; measure: () => void }) {
  if (!props.render) return null;
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-muted-foreground">
          Lädt …
        </p>
      }
    >
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
  const measure = () => closing(close, p.onMeasure)?.(card);
  const slot = (render: SlotRender | undefined) => (
    <Slot render={render} card={card} measure={measure} />
  );
  const content: Record<(typeof TABS)[number]["value"], ReactNode> = {
    ueberblick: (
      <PlantOverview
        card={card}
        access={p.photoAccess}
        growth={p.slots?.growth ? slot(p.slots.growth) : undefined}
        water={p.slots?.water ? slot(p.slots.water) : undefined}
        onTreat={() => tab.choose("pflege")}
      />
    ),
    verlauf: p.slots?.history ? slot(p.slots.history) : <Measurement card={card} />,
    pflege: <PlantCareTab card={card} access={p.photoAccess} care={slot(p.slots?.care)} />,
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
        onLightZone={p.onLightZone ? () => closing(close, p.onLightZone)?.(card) : undefined}
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
  const items = moreItems(card, props, closeLayer);
  return (
    <LayerSheet
      id={plantLayerId(card.id)}
      title={card.name}
      primaryAction={
        tab.tab === "ueberblick" && props.onMeasure ? (
          <MeasureButton
            card={card}
            onMeasure={() => closing(closeLayer, props.onMeasure)?.(card)}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Chips card={card} />
          {items.length > 0 ? <Menu label="Mehr" items={items} /> : null}
        </div>
        <Tabs
          label="Bereiche der Pflanze"
          tabs={tabContents(props, tab, closeLayer)}
          value={tab.tab}
          onValueChange={tab.choose}
        />
      </div>
    </LayerSheet>
  );
}
