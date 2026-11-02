import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Banner } from "@/components/shared/states/banner/banner";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { useState } from "react";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LightOverviewView } from "../../light-overview-view/light-overview-view";
import { RulesView } from "../../rules-view";
import { DerivationForm } from "../../../zones/derivation-view/derivation-view";
import { LocationForm } from "../../../zones/locations-view/locations-view";
import { ZoneForm } from "../../../zones/zones-view/zones-view";
import type { LightData, LightOverview, Response } from "../../../shared/light-api/light-api";
import { refusalText } from "../../../shared/texts";
import type { LightActions } from "../light-view";

/** The layers of the management of locations and light zones (US-QS-19); each opens from the page by its id. */
export const NEW_ZONE = "new-zone";
export const NEW_LOCATION = "new-location";
export const HINTS = "hints";
export const REFERENCE = "reference";

/** The create form of a zone or a location; a saved entry closes the layer, so the list shows it (US-QS-19). */
export function CreateLayers(props: { data: LightData; actions: LightActions }) {
  const { data, actions } = props;
  const zone = useLayer(NEW_ZONE);
  const location = useLayer(NEW_LOCATION);
  return (
    <>
      <LayerSheet id={NEW_ZONE} title="Neue Lichtzone">
        <ZoneForm
          onSave={async (e) => {
            const f = await actions.zoneCreate(e);
            if (!f) zone.closeLayer();
            return f;
          }}
          onCancel={zone.closeLayer}
        />
      </LayerSheet>
      <LayerSheet id={NEW_LOCATION} title="Neuer Standort">
        <LocationForm
          zones={data.zones}
          onSave={async (e) => {
            const f = await actions.locationCreate(e);
            if (!f) location.closeLayer();
            return f;
          }}
          onCancel={location.closeLayer}
        />
      </LayerSheet>
    </>
  );
}

/** Hints (US-BES-08): every hint says what to do (P-09); the layer names the unknown zones as well (P-10). */
export function HintsLayer({ data }: { data: LightData }) {
  const open = data.locations.filter((l) => l.lightZoneId === null);
  return (
    <LayerSheet id={HINTS} title="Hinweise">
      <div className="flex flex-col gap-4">
        {open.length > 0 && (
          <Banner variant="warning" title="Lichtzone unbekannt">
            Für {open.map((l) => l.name).join(", ")} fehlt die Lichtzone. Weise sie mit „Ändern“ zu,
            damit die Hinweise zum Licht stimmen.
          </Banner>
        )}
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
          {data.hints.map((h) => (
            <li key={h.locationId}>
              {h.text} {h.nextAction}
            </li>
          ))}
        </ul>
      </div>
    </LayerSheet>
  );
}

function OverviewSection(props: {
  overview: Response<LightOverview>;
  onOpenCollection: () => void;
  onRetry: () => void;
}) {
  const o = props.overview;
  if (o.ok) return <LightOverviewView data={o.value} onOpenCollection={props.onOpenCollection} />;
  return (
    <section aria-labelledby="overview-error" className="flex min-w-0 flex-col gap-3">
      <h2 id="overview-error" className="text-xl font-semibold">
        Lichthunger
      </h2>
      <EmptyState
        variant="error"
        title="Lichthunger konnte nicht geladen werden"
        description={refusalText(o.error)}
        action={{ label: "Erneut versuchen", onClick: props.onRetry }}
      />
    </section>
  );
}

type Topic = "overview" | "rules" | "derive";
const TOPICS: readonly { value: Topic; label: string }[] = [
  { value: "overview", label: "Lichthunger" },
  { value: "rules", label: "Regeln" },
  { value: "derive", label: "Art" },
];

/**
 * The reference of the light (US-LIC-03, US-LIC-04, US-LIC-01) as three segments, one part at a time, so each fits a
 * layer at 360 x 640 (US-QS-19): the lux overview, the classification rules, the zone of a species. Loaded only while
 * the layer is open.
 */
export function ReferenceLayer(props: {
  data: LightData;
  actions: LightActions;
  overview: Response<LightOverview>;
  onOpenCollection: () => void;
  onRetry: () => void;
}) {
  const [topic, setTopic] = useState<Topic>("overview");
  return (
    <LayerSheet id={REFERENCE} title="Lichthunger und Einstufung">
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Teil der Lichtangaben"
          options={TOPICS}
          value={topic}
          onChange={setTopic}
        />
        {topic === "overview" && (
          <OverviewSection
            overview={props.overview}
            onOpenCollection={props.onOpenCollection}
            onRetry={props.onRetry}
          />
        )}
        {topic === "rules" && <RulesView zones={props.data.zones} />}
        {topic === "derive" && (
          <section aria-labelledby="assignment" className="flex min-w-0 flex-col gap-3">
            <h2 id="assignment" className="text-xl font-semibold">
              Zone einer Art ermitteln
            </h2>
            <MoreHelp
              className="text-sm text-muted-foreground"
              more="Stecklingslicht ist nie das Ziel für erwachsene Pflanzen."
            >
              Die Zone folgt dem Lux-Bedarf der Art und deinen Lichtzonen.
            </MoreHelp>
            <DerivationForm onDerive={props.actions.zoneDerive} />
          </section>
        )}
      </div>
    </LayerSheet>
  );
}
