import type {
  ApiError,
  LightData,
  LightOverview,
  Response,
} from "../../shared/light-api/light-api";
import { ErrorMessage } from "../../shared/ui/message/message";
import { ZoneLayer } from "../../zones/zone-layer/zone-layer";
import { LocationLayer } from "../../zones/location-layer/location-layer";
import { CreateLayers, HintsLayer, ReferenceLayer } from "./light-layers/light-layers";
import { ManageLists, Notices } from "./manage-lists/manage-lists";
import type { ZoneInput } from "../../zones/zones-view/zones-view";
import type { LocationInput } from "../../zones/locations-view/locations-view";
import type { Derive } from "../../zones/derivation-view/derivation-view";

type AppError = Promise<ApiError | null>;

export interface LightActions {
  zoneCreate: (e: ZoneInput) => AppError;
  zoneUpdate: (id: string, e: ZoneInput) => AppError;
  zoneDelete: (id: string) => AppError;
  defaults: () => AppError;
  locationCreate: (e: LocationInput) => AppError;
  locationUpdate: (id: string, e: LocationInput) => AppError;
  zoneDerive: Derive;
}

/**
 * The management of the locations and light zones (US-QS-19, US-LIC-05) as one screen: the heading, the two lists
 * (segments on a phone, two columns from 768 px) with compact rows, the notices and the reference as layers. Every
 * change opens a layer; the layers are siblings of the page, so a layer stands beside the page from 1024 px.
 */
export function LightView(props: {
  data: LightData;
  actions: LightActions;
  error?: ApiError;
  overview: Response<LightOverview>;
  onOpenCollection: () => void;
  onRetry: () => void;
  /** Inside the Sammlung the page header above is the one h1 (issue 1031). */
  hosted?: boolean;
}) {
  const { data, actions } = props;
  return (
    <div className="flex min-w-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {props.hosted ? null : <h1 className="text-xl font-semibold">Standorte und Lichtzonen</h1>}
        {props.error && <ErrorMessage error={props.error} />}
        <ManageLists data={data} actions={actions} />
        <Notices data={data} />
      </div>
      {data.zones.map((z) => (
        <ZoneLayer
          key={z.id}
          zone={z}
          onUpdate={(e) => actions.zoneUpdate(z.id, e)}
          onDelete={() => actions.zoneDelete(z.id)}
        />
      ))}
      {data.locations.map((s) => (
        <LocationLayer
          key={s.id}
          location={s}
          zones={data.zones}
          onUpdate={(e) => actions.locationUpdate(s.id, e)}
        />
      ))}
      <CreateLayers data={data} actions={actions} />
      <HintsLayer data={data} />
      <ReferenceLayer
        data={data}
        actions={actions}
        overview={props.overview}
        onOpenCollection={props.onOpenCollection}
        onRetry={props.onRetry}
      />
    </div>
  );
}
