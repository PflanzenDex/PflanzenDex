import { useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import {
  accountKey,
  entityKey,
  useWriteAction,
  newRepeatKey,
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

/**
 * The options of one species write of a bulk action (US-QS-03, P-10): each species is its own write with a key of its own,
 * and, while the device is offline, its own buffered entry that says its own result when it is delivered.
 */
function speciesOptions(
  o: WriteOptions,
  announce: Announce,
  parts: { token: Token; after: () => void; success: string },
): WriteOptions {
  return {
    ...o,
    key: newRepeatKey(),
    buffer: announce
      ? (request) =>
          announce.buffer({
            token: parts.token,
            request,
            success: parts.success,
            after: parts.after,
          })
      : undefined,
  };
}

/**
 * One bulk share over every species (US-SOZ-04). Online the species go one after the other, and the first refusal stops the
 * action (P-10, US-QS-20). Offline all species are written at once: each is its own buffered entry under its own key, and
 * says its own result when it is delivered (US-QS-03, US-QS-10).
 */
async function shareAll(
  api: string,
  t: string,
  opts: WriteOptions,
  p: {
    species: readonly { speciesId: string; name: string }[];
    share: boolean;
    announce: Announce;
    token: Token;
    after: () => void;
    onPartial: (text: string) => void;
  },
) {
  const write = ({ speciesId, name }: { speciesId: string; name: string }) =>
    setSpeciesSharing(
      api,
      t,
      { speciesId, share: p.share },
      speciesOptions(opts, p.announce, {
        token: p.token,
        after: p.after,
        success: p.share ? `Freigegeben: „${name}“.` : `Zurückgezogen: „${name}“.`,
      }),
    );
  if (!isOnline()) {
    const results = await Promise.all(p.species.map(write));
    const failed = results.find((r) => !r.ok);
    if (failed) p.onPartial(partialText(results.filter((r) => r.ok).length, results.length));
    return failed ?? results[0] ?? { ok: true as const, value: { changed: 0 } };
  }
  let last: Awaited<ReturnType<typeof write>> | undefined;
  let done = 0;
  for (const species of p.species) {
    last = await write(species);
    if (!last.ok) {
      p.onPartial(partialText(done, p.species.length));
      return last;
    }
    done += 1;
  }
  return last ?? { ok: true as const, value: { changed: 0 } };
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
    void sharing.run(
      (t, opts) =>
        shareAll(api, t, opts, {
          species,
          share,
          announce,
          token: props.token,
          after: props.onWritten,
          onPartial: setPartial,
        }),
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
