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
        ? "Freigegeben: Freunde sehen dieses Exemplar ab jetzt."
        : "Zurückgezogen: Freunde sehen dieses Exemplar ab dem nächsten Abruf nicht mehr.",
    );
  const setSpecies = (speciesId: string, share: boolean) =>
    void sharing.run(
      (t) => setSpeciesSharing(api, t, { speciesId, share }),
      share
        ? "Alle Exemplare dieser Art sind für Freunde freigegeben."
        : "Alle Exemplare dieser Art sind zurückgezogen.",
    );
  return (
    <>
      <Outcome message={sharing.message} error={sharing.error} />
      <SharingPanel
        specimens={data.specimens}
        shared={data.shared}
        busy={sharing.running}
        onSet={set}
        onSetSpecies={setSpecies}
      />
    </>
  );
}
