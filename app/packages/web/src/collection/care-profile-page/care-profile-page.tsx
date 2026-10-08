import { useCallback } from "react";
import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { loadLocations, loadZones } from "../../light";
import { loadCareProfiles, saveCareProfile } from "../care-profile-api";
import { CareProfileSectionSkeleton } from "./care-profile-page.skeleton";
import { ProfileList } from "../care-profile-list";

interface Data {
  readonly entries: readonly CareProfileEntry[];
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

const KEY = ["collection", "care-profile"] as const;

/**
 * My own care profile of one species (US-BES-09), a section of the species profile (US-QS-14): the catalog value and
 * my deviation side by side, only for the fields a keeper may deviate in (FR-BES-09). The catalog stays untouched; the
 * profile is private (P-05). Targets are chosen from the own locations, never typed (FR-PHA-03). Every save says what
 * changed, a refusal stays visible (P-10). A profile kept from a proposal that was merged into this species shows here too (US-BES-10). The section sits below a heading of its own, so it has none.
 */
export function CareProfileSection(props: {
  api: string;
  token: () => Promise<string | undefined>;
  speciesId: string;
}) {
  const { api, token, speciesId } = props;
  const again = useInvalidate(KEY);
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
        value: {
          entries: entries.value.filter(
            (e) => e.speciesId === speciesId || e.mergedInto?.speciesId === speciesId,
          ),
          locations: locations.value,
          zones: zones.value,
        },
      };
    },
    [api, speciesId],
  );
  const save = (speciesId: string, changes: CareProfileChanges, success: string) =>
    void write.run((t) => saveCareProfile(api, t, { speciesId, changes }), success);
  return (
    <div className="min-w-0">
      <LoadFrame
        queryKey={KEY}
        fresh
        token={token}
        load={load}
        loadingText="Pflegeprofil wird geladen …"
        loadingFallback={<CareProfileSectionSkeleton label="Pflegeprofil wird geladen …" />}
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
