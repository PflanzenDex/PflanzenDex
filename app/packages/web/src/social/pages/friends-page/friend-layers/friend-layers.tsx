import { answerFriendRequest, endFriendship, type FriendsData } from "../../../api/friends-api";
import { FeedBlock } from "../../../feed/feed-block/feed-block";
import { FriendsBanner } from "../../../feed/friends-banner/friends-banner";
import { FriendList } from "../../../parts/friend-list/friend-list";
import { nameOf, RequestList } from "../../../parts/request-list/request-list";
import { useWriteAction } from "../../../../shared/data";
import { Layer } from "./layer/layer";
import { Outcome } from "./outcome/outcome";
import { SharingSection } from "./sharing-section/sharing-section";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../social.de.json";

// `t` names the token in the write callbacks of this file.
const tx = texts(table);

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
      <Layer id="requests" title={tx("layers.requests")}>
        <Outcome message={answer.message} error={answer.error} />
        <RequestList
          requests={data.requests}
          busy={answer.running}
          onAnswer={(id, decision) =>
            void answer.run(
              (t, key) => answerFriendRequest(api, t, { requestId: id, decision }, { key }),
              decision === "accept"
                ? tx("friends.accepted", {
                    name: nameOf(
                      data.requests.incoming.find((r) => r.id === id)?.otherName ?? null,
                    ),
                  })
                : tx("friends.declined"),
            )
          }
        />
      </Layer>
      <Layer id="news" title={tx("layers.news")}>
        {/* One screen (issue 1157): the banner is one row and the feed pages by the free height of the layer. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <FriendsBanner api={api} token={token} compact />
          <FeedBlock
            api={api}
            token={token}
            friends={data.friends.map((f) => ({ id: f.id, name: f.name }))}
          />
        </div>
      </Layer>
      <Layer id="friends" title={tx("layers.friends")}>
        <Outcome message={ending.message} error={ending.error} />
        <FriendList
          friends={data.friends}
          busy={ending.running}
          onEnd={(f) =>
            void ending.run(
              (t, key) => endFriendship(api, t, f.id, { key }),
              tx("friends.ended", { name: nameOf(f.name) }),
            )
          }
        />
      </Layer>
      <Layer id="sharing" title={tx("layers.sharing")}>
        <SharingSection data={data} api={api} token={token} onWritten={props.onWritten} />
      </Layer>
    </>
  );
}

/** The layer "Mehr erfahren" (`?sheet=help`): the full explanation of friends and sharing that the screen keeps to one line. */
export function HelpLayer() {
  return (
    <Layer id="help" title={tx("layers.help")}>
      <div className="flex flex-col gap-3">
        <p>{tx("help.code")}</p>
        <p>{tx("help.sharing")}</p>
        <p>{tx("help.withdraw")}</p>
      </div>
    </Layer>
  );
}
