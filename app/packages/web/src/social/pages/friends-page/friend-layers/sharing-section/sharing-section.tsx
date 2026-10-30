import { useWriteAction } from "../../../../../kernel";
import {
  setSpeciesSharing,
  setSpecimenSharing,
  type FriendsData,
} from "../../../../api/friends-api";
import { SharingPanel } from "../../../../parts/sharing-panel/sharing-panel";
import { Outcome } from "../outcome/outcome";

/** The sharing panel with its own writes and their outcome (US-SOZ-04): one request at a time, the page reloads after each. */
export function SharingSection(props: {
  data: FriendsData;
  api: string;
  token: () => Promise<string | undefined>;
  onWritten: () => void;
}) {
  const { api, data } = props;
  const sharing = useWriteAction(props.token, props.onWritten);
  const set = (specimenId: string, share: boolean) =>
    void sharing.run(
      (t) => setSpecimenSharing(api, t, { specimenId, share }),
      share
        ? "Freigegeben: Freunde sehen diese Pflanze ab jetzt."
        : "Zurückgezogen: Freunde sehen diese Pflanze ab dem nächsten Abruf nicht mehr.",
    );
  // One bulk action over every active species, one request after the other; the first refusal stops it (P-10).
  const setAll = (share: boolean) => {
    const ids = [
      ...new Set(data.specimens.filter((s) => s.status !== "archived").map((s) => s.speciesId)),
    ];
    void sharing.run(
      async (t) => {
        let last: Awaited<ReturnType<typeof setSpeciesSharing>> | undefined;
        for (const speciesId of ids) {
          last = await setSpeciesSharing(api, t, { speciesId, share });
          if (!last.ok) return last;
        }
        return last ?? { ok: true as const, value: { changed: 0 } };
      },
      share
        ? "Alle Pflanzen sind für Freunde freigegeben."
        : "Alle Pflanzen sind zurückgezogen: Freunde sehen sie ab dem nächsten Abruf nicht mehr.",
    );
  };
  return (
    <>
      <Outcome message={sharing.message} error={sharing.error} />
      <SharingPanel
        specimens={data.specimens}
        shared={data.shared}
        busy={sharing.running}
        onSet={set}
        onSetAll={setAll}
      />
    </>
  );
}
