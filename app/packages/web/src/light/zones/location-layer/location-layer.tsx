import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import type { ApiError, LightLocation, LightZone } from "../../shared/light-api/light-api";
import { LocationForm, type LocationInput } from "../locations-view/locations-view";

type Save = (e: LocationInput) => Promise<ApiError | null>;

/** The id of the layer that changes one location (`?sheet=location-<id>`, US-QS-19). */
export const locationLayerId = (id: string) => `location-${id}`;

/** The layer that changes one location (US-QS-19, US-LIC-05); a location is changed here, its zone included. */
export function LocationLayer(props: {
  location: LightLocation;
  zones: readonly LightZone[];
  onUpdate: Save;
}) {
  const { location } = props;
  const { closeLayer } = useLayer(locationLayerId(location.id));
  return (
    <LayerSheet id={locationLayerId(location.id)} title="Standort bearbeiten">
      <LocationForm
        zones={props.zones}
        start={location}
        onCancel={closeLayer}
        onSave={async (e) => {
          const f = await props.onUpdate(e);
          if (!f) closeLayer();
          return f;
        }}
      />
    </LayerSheet>
  );
}
