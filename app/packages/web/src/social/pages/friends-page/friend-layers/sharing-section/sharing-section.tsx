import { useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import {
  accountKey,
  entityKey,
  useWriteAction,
  type WriteOptions,
} from "../../../../../shared/data";
import {
  setSpeciesSharing,
  setSpecimenSharing,
  type FriendsData,
} from "../../../../api/friends-api";
import { SharingPanel } from "../../../../parts/sharing-panel/sharing-panel";
import { partialText } from "./sharing-text";
import { Outcome } from "../outcome/outcome";

type Token = () => Promise<string | undefined>;
type Announce = ReturnType<typeof useAnnounce>;
type Species = readonly { speciesId: string; name: string }[];

/**
 * The key of one species write of a bulk action (US-QS-03): derived from the key of the action, so a repeat of the bulk after
 * a lost answer carries the same key per species (as the undo of a bulk move does, `restorePhaseLocations`).
 */
const speciesKey = (actionKey: string, speciesId: string): string => `${actionKey}:${speciesId}`;

/**
 * One bulk share over every species, online (US-SOZ-04): the species go one after the other, and the first refusal stops the
 * action and is reported with the count of the species that changed (P-10, US-QS-20). A species write has no buffer: a
 * connection lost in between is refused here, never queued under the bulk's own result.
 */
async function shareAll(
  api: string,
  t: string,
  opts: WriteOptions,
  p: { species: Species; share: boolean; onPartial: (text: string) => void },
) {
  let last: Awaited<ReturnType<typeof setSpeciesSharing>> | undefined;
  let done = 0;
  for (const { speciesId } of p.species) {
    last = await setSpeciesSharing(
      api,
      t,
      { speciesId, share: p.share },
      { ...opts, key: speciesKey(opts.key, speciesId), buffer: undefined },
    );
    if (!last.ok) {
      p.onPartial(partialText(done, p.species.length));
      return last;
    }
    done += 1;
  }
  return last ?? { ok: true as const, value: { changed: 0 } };
}

/**
 * A bulk share while the device is offline (US-QS-03, US-QS-10): each species is its own buffered entry under its own key,
 * and each says its own result when it is delivered. Only the last entry reloads the page, so the bulk costs one reload. No
 * entry claims the bulk as a whole, so a refused species is never hidden behind a success (P-10).
 */
function queueAll(p: {
  api: string;
  key: string;
  species: Species;
  share: boolean;
  announce: Announce;
  token: Token;
  after: () => void;
}) {
  const { api, key, species, share, announce, token, after } = p;
  return Promise.all(
    species.map(({ speciesId, name }, index) =>
      setSpeciesSharing(
        api,
        "",
        { speciesId, share },
        {
          key: speciesKey(key, speciesId),
          buffer: announce
            ? (request) =>
                announce.buffer({
                  token,
                  request,
                  success: share ? `Freigegeben: „${name}“.` : `Zurückgezogen: „${name}“.`,
                  after: index === species.length - 1 ? after : () => undefined,
                })
            : undefined,
        },
      ),
    ),
  );
}

/** The species of the keeper's active plants, with the name of one of their plants (US-SOZ-04). */
function activeSpecies(data: FriendsData) {
  const seen = new Map<string, string>();
  for (const s of data.specimens)
    if (s.status !== "archived" && !seen.has(s.speciesId)) seen.set(s.speciesId, s.name);
  return [...seen].map(([speciesId, name]) => ({ speciesId, name }));
}

/** The sharing panel with its own writes and their outcome (US-SOZ-04): one request at a time, the page reloads after each. */
export function SharingSection(props: {
  data: FriendsData;
  api: string;
  token: Token;
  onWritten: () => void;
}) {
  const { api, data } = props;
  const announce = useAnnounce();
  const sharing = useWriteAction(props.token, props.onWritten);
  const bulk = { api, announce, token: props.token, after: props.onWritten };
  // How far a refused bulk action got: the page reloads, so the switches show the real state (P-10).
  const [partial, setPartial] = useState<string | null>(null);
  const set = (specimenId: string, share: boolean) =>
    void sharing.run(
      (t, opts) => setSpecimenSharing(api, t, { specimenId, share }, opts),
      share
        ? "Freigegeben: Freunde sehen diese Pflanze ab jetzt."
        : "Zurückgezogen: Freunde sehen diese Pflanze ab dem nächsten Abruf nicht mehr.",
      entityKey("specimen", specimenId, `share:${share}`),
    );
  const setAll = (share: boolean) => {
    const species = activeSpecies(data);
    setPartial(null);
    if (!isOnline()) {
      void sharing.runQuiet((key) => queueAll({ ...bulk, key, species, share }));
      return;
    }
    void sharing.run(
      (t, opts) => shareAll(api, t, opts, { species, share, onPartial: setPartial }),
      share
        ? "Alle Pflanzen sind für Freunde freigegeben."
        : "Alle Pflanzen sind zurückgezogen: Freunde sehen sie ab dem nächsten Abruf nicht mehr.",
      accountKey(`share-all:${share}:${species.map((s) => s.speciesId).join(",")}`),
    );
  };
  return (
    <>
      <Outcome message={sharing.message} error={sharing.error} />
      {partial && sharing.error && (
        <p role="status" className="rounded-lg border border-border p-3">
          {partial}
        </p>
      )}
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
