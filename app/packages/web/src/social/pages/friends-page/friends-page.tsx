import { useCallback } from "react";
import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LoadFrame, useInvalidate, useRequest } from "../../../kernel";
import { loadFriends, type FriendsData } from "../../api/friends-api";
import { loadBanner } from "../../api/feed-api";
import { sharingChoice } from "../../parts/sharing-panel/sharing-panel";
import { AddFriendLayer } from "./friend-layers/add-friend-layer/add-friend-layer";
import { HelpLayer, ListLayers } from "./friend-layers/friend-layers";
import {
  HelpOpener,
  LayerRow,
  LayerTile,
  LinkTile,
  type TileCount,
} from "./friend-tiles/friend-tiles";
import { FriendsPageSkeleton } from "./friends-page.skeleton";

const KEY = ["social", "friends"] as const;
type Token = () => Promise<string | undefined>;

/** Calm mode shows no counts (US-ACH-08, US-TAU-07); otherwise the count of the news banner while it loads or fails (P-10). */
function useNewsCount(api: string, token: Token, calm: boolean): TileCount {
  const load = useCallback((t: string) => loadBanner(api, t), [api]);
  const r = useRequest({ queryKey: ["social", "banner"], token, load });
  if (calm) return "hidden";
  if (r.status === "error") return "error";
  return r.value === undefined ? "loading" : r.value.firstVisit ? 0 : r.value.count;
}

type Options = {
  /** Calm mode is on or not known yet: the tiles show their names without counts (US-ACH-08). */
  calm: boolean;
};

const friendsText = (n: number) => (n === 0 ? "Noch keine" : n === 1 ? "1 Freund" : `${n} Freunde`);

function Body(props: {
  data: FriendsData;
  api: string;
  token: Token;
  onWritten: () => void;
  options: Options;
}) {
  const { api, token, data, options } = props;
  const news = useNewsCount(api, token, options.calm);
  const add = useLayer("add");
  const open = data.requests.incoming.length;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data.friends.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-3">
          Noch keine Freunde. „Freund hinzufügen“ ist der nächste Schritt.
        </p>
      )}
      <Button
        type="button"
        size="touch"
        aria-haspopup="dialog"
        aria-expanded={add.open}
        onClick={(event) => add.openLayer(event.currentTarget)}
      >
        Freund hinzufügen
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <LayerTile id="requests" name="Anfragen" count={options.calm ? "hidden" : open} />
        <LayerTile id="news" name="Neu bei Freunden" count={news} />
        <LinkTile to="/friends/exchange" name="Tauschbörse" />
        <LinkTile to="/friends/match" name="Passende Angebote" />
      </div>
      <div className="flex flex-col gap-2">
        <LayerRow id="friends" name="Meine Freunde" state={friendsText(data.friends.length)} />
        <LayerRow
          id="sharing"
          name="Was Freunde sehen"
          state={sharingChoice(data.specimens, data.shared)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Ohne deine Freigabe sieht niemand etwas. <HelpOpener />
      </p>
      <AddFriendLayer api={api} token={token} onWritten={props.onWritten} />
      <ListLayers api={api} token={token} data={data} onWritten={props.onWritten} />
      <HelpLayer />
    </div>
  );
}

/**
 * The page "Freunde" as one screen (US-QS-20, US-SOZ-01, US-SOZ-02): the one filled action "Freund hinzufügen", tiles for the
 * requests, the news, the exchange and the matching offers, rows for the friends and for what friends see, and one line of
 * help. Every part opens as a layer (`?sheet=add|requests|news|friends|sharing|help`) and lists are paged. Nothing here
 * shows a friend's collection: private by default (P-05), and there are no rankings between friends. A write reloads
 * everything (P-10). Calm mode shows the tiles without counts.
 */
export function FriendsPage(props: { api: string; token: Token; calm?: boolean }) {
  const { api, token } = props;
  const options: Options = { calm: props.calm ?? false };
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadFriends(api, t), [api]);
  return (
    <div className="min-w-0">
      <section aria-labelledby="friends-title" className="flex min-w-0 flex-col gap-3">
        <h1 id="friends-title" className="text-2xl font-semibold">
          Freunde
        </h1>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Freunde werden geladen …"
          loadingFallback={<FriendsPageSkeleton label="Freunde werden geladen …" />}
        >
          {(data: FriendsData) => (
            <Body data={data} api={api} token={token} onWritten={reload} options={options} />
          )}
        </LoadFrame>
      </section>
    </div>
  );
}
