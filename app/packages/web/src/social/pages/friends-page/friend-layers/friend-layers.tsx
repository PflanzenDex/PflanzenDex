import { answerFriendRequest, endFriendship, type FriendsData } from "../../../api/friends-api";
import { FeedBlock } from "../../../feed/feed-block/feed-block";
import { FriendsBanner } from "../../../feed/friends-banner/friends-banner";
import { FriendList } from "../../../parts/friend-list/friend-list";
import { nameOf, RequestList } from "../../../parts/request-list/request-list";
import { useWriteAction } from "../../../../kernel";
import { Layer } from "./layer/layer";
import { Outcome } from "./outcome/outcome";
import { SharingSection } from "./sharing-section/sharing-section";

/** The four layers with lists: requests, news, friends and sharing (US-QS-20), each with the outcome of its own writes. */
export function ListLayers(props: {
  api: string;
  token: () => Promise<string | undefined>;
  data: FriendsData;
  onWritten: () => void;
}) {
  const { api, token, data } = props;
  const answer = useWriteAction(token, props.onWritten);
  const ending = useWriteAction(token, props.onWritten);
  return (
    <>
      <Layer id="requests" title="Anfragen">
        <Outcome message={answer.message} error={answer.error} />
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
      </Layer>
      <Layer id="news" title="Neu bei Freunden">
        <div className="flex flex-col gap-3">
          <FriendsBanner api={api} token={token} />
          <FeedBlock
            api={api}
            token={token}
            friends={data.friends.map((f) => ({ id: f.id, name: f.name }))}
          />
        </div>
      </Layer>
      <Layer id="friends" title="Meine Freunde">
        <Outcome message={ending.message} error={ending.error} />
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
      </Layer>
      <Layer id="sharing" title="Was Freunde sehen">
        <SharingSection data={data} api={api} token={token} onWritten={props.onWritten} />
      </Layer>
    </>
  );
}

/** The layer "Mehr erfahren" (`?sheet=help`): the full explanation of friends and sharing that the screen keeps to one line. */
export function HelpLayer() {
  return (
    <Layer id="help" title="Freunde und Freigaben">
      <div className="flex flex-col gap-3">
        <p>
          Freunde findest du nur über einen Code, den ihr außerhalb der App austauscht. Wer ihn
          eingibt, schickt dir eine Anfrage; erst wenn du sie annimmst, seid ihr befreundet.
        </p>
        <p>
          Was Freunde von dir sehen, bestimmst du; ohne deine Freigabe sieht niemand etwas. Von
          einer freigegebenen Pflanze sehen Freunde nur die Art, den Namen, das Fangdatum und ob es
          ein Steckling ist, nie Standort, Messwerte, Behandlungen, Kennzeichen oder Preise.
        </p>
        <p>
          Ein Zurückziehen gilt ab dem nächsten Abruf; was schon angezeigt wurde, lässt sich nicht
          zurückholen. „Alles privat“ in den Einstellungen setzt alle Freigaben aus, ohne sie zu
          löschen.
        </p>
      </div>
    </Layer>
  );
}
