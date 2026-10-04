import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import type { ApiError } from "../kernel";
import { CareProfileCard } from "./care-profile-card";

export interface ProfileData {
  readonly entries: readonly CareProfileEntry[];
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

/** The page body: what was saved or refused, the hint to create a location first, and one card per species. */
export function ProfileList(props: {
  data: ProfileData;
  write: { running: boolean; message: string | null; error: ApiError | null };
  onSave: (speciesId: string, changes: CareProfileChanges, success: string) => void;
}) {
  const { data, write } = props;
  return (
    <section aria-labelledby="care-profile-title">
      <h1 id="care-profile-title">Pflegeprofil</h1>
      <p className="quiet">
        Hier weichst du von den Katalogwerten ab, wo dein Standort oder dein Klima es verlangt. Der
        Katalog bleibt unverändert. Dein Pflegeprofil ist privat und nie Teil einer Freigabe.
      </p>
      {write.message && (
        <p role="status" className="hint">
          {write.message}
        </p>
      )}
      {write.error && (
        <div role="alert" className="warning">
          <p>{write.error.text}</p>
        </div>
      )}
      {data.locations.length === 0 && (
        <p className="next-action">
          Du hast noch keinen Standort angelegt. Lege zuerst unter „Standorte und Licht“ einen
          Standort an, dann kannst du Soll-Standorte je Phase wählen.
        </p>
      )}
      {data.entries.length === 0 ? (
        <p>
          Noch keine Art im Bestand: Lege zuerst im Bestand ein Exemplar an, dann kannst du hier das
          Pflegeprofil der Art anpassen.
        </p>
      ) : (
        <ul className="cards-grid profile-grid">
          {data.entries.map((entry) => (
            <li key={`${entry.speciesId}:${JSON.stringify(entry.profile)}`}>
              <CareProfileCard
                entry={entry}
                lists={data}
                busy={write.running}
                onSave={(changes, success) => props.onSave(entry.speciesId, changes, success)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
