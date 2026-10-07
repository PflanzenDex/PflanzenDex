import { useCallback, useState } from "react";
import type { CreatedFriendCode } from "@pflanzendex/core";
import { LoadFrame, SIGN_IN, useInvalidate, useWriteAction, type ApiError } from "../../../kernel";
import { errorText } from "@/lib/error-text";
import {
  answerFriendRequest,
  createFriendCode,
  endFriendship,
  loadFriends,
  setSpeciesSharing,
  setSpecimenSharing,
  sendFriendRequest,
  type FriendsData,
} from "../../api/friends-api";
import { CodeForm } from "../../parts/code-form/code-form";
import { FriendList } from "../../parts/friend-list/friend-list";
import { FriendsBanner } from "../../feed/friends-banner/friends-banner";
import { FeedBlock } from "../../feed/feed-block/feed-block";
import { SharingPanel } from "../../parts/sharing-panel/sharing-panel";
import { InviteCard } from "../../parts/invite-card/invite-card";
import { nameOf, RequestList } from "../../parts/request-list/request-list";
import { FriendsPageSkeleton } from "./friends-page.skeleton";

const KEY = ["social", "friends"] as const;
type Token = () => Promise<string | undefined>;

/** Sends the code form's request and hands a refusal back to the field; one request at a time (a double tap sends one). */
function useSendRequest(api: string, token: Token, reload: () => void) {
  const write = useWriteAction(token, reload);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const send = async (code: string): Promise<boolean> => {
    let ok = false;
    await write.run(async (t) => {
      const r = await sendFriendRequest(api, t, code);
      ok = r.ok;
      setRefusal(r.ok ? null : r.error);
      return r;
    }, "Anfrage gesendet. Sobald die Person sie annimmt, seid ihr befreundet.");
    return ok;
  };
  return { send, refusal, write };
}

/** What the last write did: a notice, or the German text of its refusal (P-10). */
function Outcome(props: { message: string | null; error: ApiError | null }) {
  const { message, error } = props;
  return (
    <>
      {message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {error.code === SIGN_IN.code ? SIGN_IN.text : errorText(error.code)}
        </p>
      )}
    </>
  );
}

/** The sharing panel with its own writes and their outcome (US-SOZ-04): one request at a time, the page reloads after each. */
function SharingSection(props: {
  data: FriendsData;
  api: string;
  token: Token;
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

function Body(props: { data: FriendsData; api: string; token: Token; onWritten: () => void }) {
  const { api, token, data } = props;
  const [created, setCreated] = useState<CreatedFriendCode | null>(null);
  const invite = useWriteAction(token, props.onWritten);
  const answer = useWriteAction(token, props.onWritten);
  const ending = useWriteAction(token, props.onWritten);
  const request = useSendRequest(api, token, props.onWritten);
  const message = [invite.message, answer.message, ending.message, request.write.message].find(
    (m) => m !== null,
  );
  const error = invite.error ?? answer.error ?? ending.error;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Outcome message={message ?? null} error={error ?? null} />
      <FriendsBanner api={api} token={token} />
      <FeedBlock
        api={api}
        token={token}
        friends={data.friends.map((f) => ({ id: f.id, name: f.name }))}
      />
      <RequestList
        requests={data.requests}
        busy={answer.running}
        onAnswer={(id, decision) =>
          void answer.run(
            (t) => answerFriendRequest(api, t, { requestId: id, decision }),
            decision === "accept"
              ? `Du bist jetzt mit ${nameOf(
                  data.requests.incoming.find((r) => r.id === id)?.otherName ?? null,
                )} befreundet.`
              : "Anfrage abgelehnt. Die Person erfährt nur, dass sie nicht angenommen wurde.",
          )
        }
      />
      <FriendList
        friends={data.friends}
        busy={ending.running}
        onEnd={(f) =>
          void ending.run(
            (t) => endFriendship(api, t, f.id),
            `Freundschaft mit ${nameOf(f.name)} beendet. Ihr seht nichts mehr voneinander; deine eigenen Daten bleiben.`,
          )
        }
      />
      <SharingSection data={data} api={api} token={token} onWritten={props.onWritten} />
      <InviteCard
        created={created}
        running={invite.running}
        onCreate={() =>
          void invite.run(async (t) => {
            const r = await createFriendCode(api, t);
            if (r.ok) setCreated(r.value);
            return r;
          }, "Code erzeugt.")
        }
      />
      <CodeForm running={request.write.running} refusal={request.refusal} onSend={request.send} />
    </div>
  );
}

/**
 * The page "Freunde" (US-SOZ-01, US-SOZ-02): open requests with accept and decline, the confirmed friends, a button to
 * invite with a code and the field to enter a code. Nothing here shows a friend's collection: private by default
 * (P-05), and there are no rankings between friends. A write reloads everything (P-10).
 */
export function FriendsPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadFriends(api, t), [api]);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <section aria-labelledby="friends-title" className="flex min-w-0 flex-col gap-3">
        <h1 id="friends-title" className="text-2xl font-semibold">
          Freunde
        </h1>
        <p className="text-muted-foreground">
          Freunde findest du nur über einen Code, den ihr außerhalb der App austauscht. Was sie von
          dir sehen, bestimmst du; ohne deine Freigabe sieht niemand etwas.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Freunde werden geladen …"
          loadingFallback={<FriendsPageSkeleton label="Freunde werden geladen …" />}
        >
          {(data: FriendsData) => <Body data={data} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </section>
    </div>
  );
}
