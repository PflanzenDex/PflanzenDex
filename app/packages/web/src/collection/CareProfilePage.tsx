import { useCallback, useState } from "react";
import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import { LoadFrame, useWriteAction } from "../kernel";
import { loadLocations, loadZones } from "../light";
import { loadCareProfiles, saveCareProfile } from "./care-profile-api";
import { ProfileList } from "./care-profile-list";

interface Data {
  readonly entries: readonly CareProfileEntry[];
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

/**
 * My own care profile per species (US-BES-09): the catalog value and my deviation side by side, only for the fields
 * a keeper may deviate in (FR-BES-09). The catalog stays untouched; the profile is private (P-05). Targets are chosen
 * from the own locations, never typed (FR-PHA-03). Every save says what changed, a refusal stays visible (P-10).
 */
export function CareProfilePage(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const [refresh, setRefresh] = useState(0);
  const again = useCallback(() => setRefresh((n) => n + 1), []);
  const write = useWriteAction(token, again);
  const load = useCallback(
    async (t: string) => {
      const [entries, locations, zones] = await Promise.all([
        loadCareProfiles(api, t),
        loadLocations(api, t),
        loadZones(api, t),
      ]);
      if (!entries.ok) return entries;
      if (!locations.ok) return locations;
      if (!zones.ok) return zones;
      return {
        ok: true as const,
        value: { entries: entries.value, locations: locations.value, zones: zones.value },
      };
    },
    [api],
  );
  const save = (speciesId: string, changes: CareProfileChanges, success: string) =>
    void write.run((t) => saveCareProfile(api, t, { speciesId, changes }), success);
  return (
    <div className="light collection">
      <LoadFrame
        token={token}
        load={load}
        loadingText="Pflegeprofil wird geladen …"
        refresh={refresh}
      >
        {(data: Data) => (
          <ProfileList
            data={data}
            write={write}
            onSave={(speciesId, changes, success) => save(speciesId, changes, success)}
          />
        )}
      </LoadFrame>
    </div>
  );
}
