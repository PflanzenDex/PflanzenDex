import type {
  CareProfileChanges,
  CareProfileEntry,
  LightLocation,
  LightZone,
} from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import type { ApiError } from "../../../kernel";
import { CareProfileCard } from "../sections/care-profile-card/care-profile-card";
import { KeptProfileCard } from "../sections/kept-profile-card/kept-profile-card";
import {
  NextAction,
  PROFILE_GRID,
  Quiet,
  Status,
  Warning,
} from "../../specimens/cards/parts/parts";
import { refusalText } from "../../specimens/model/refusal";

export interface ProfileData {
  readonly entries: readonly CareProfileEntry[];
  readonly locations: readonly LightLocation[];
  readonly zones: readonly LightZone[];
}

/** The section body: what was saved or refused, the hint to create a location first, and the card of the species. */
export function ProfileList(props: {
  data: ProfileData;
  write: { running: boolean; message: string | null; error: ApiError | null };
  onSave: (speciesId: string, changes: CareProfileChanges, success: string) => void;
}) {
  const { data, write } = props;
  return (
    <div>
      <Quiet className="mb-3">
        Hier weichst du von den Katalogwerten ab, wo dein Standort oder dein Klima es verlangt. Der
        Katalog bleibt unverändert. Dein Pflegeprofil ist privat und nie Teil einer Freigabe.
      </Quiet>
      {write.message && <Status>{write.message}</Status>}
      {write.error && (
        <Warning>
          <p>{refusalText(write.error)}</p>
        </Warning>
      )}
      {data.locations.length === 0 && (
        <div className="mb-3">
          <NextAction>
            Du hast noch keinen Standort angelegt. Lege zuerst in der Sammlung unter „Standorte
            verwalten“ einen Standort an, dann kannst du Soll-Standorte je Phase wählen.
          </NextAction>
        </div>
      )}
      {data.entries.length === 0 ? (
        <EmptyState
          title="Du hast noch kein Exemplar dieser Art."
          description="Lege zuerst mit „Diese Art wählen“ ein Exemplar an, dann kannst du hier das Pflegeprofil der Art anpassen."
        />
      ) : (
        <ul className={PROFILE_GRID}>
          {data.entries.map((entry) => (
            <li key={`${entry.speciesId}:${JSON.stringify(entry.profile)}`}>
              {entry.mergedInto ? (
                <KeptProfileCard entry={entry} lists={data} />
              ) : (
                <CareProfileCard
                  entry={entry}
                  lists={data}
                  busy={write.running}
                  onSave={(changes, success) => props.onSave(entry.speciesId, changes, success)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
