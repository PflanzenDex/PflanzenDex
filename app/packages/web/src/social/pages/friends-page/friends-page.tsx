import { useCallback } from "react";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { LayerHost, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ScrollRegion } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-region/scroll-region";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { useInvalidate } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadFriends, type FriendsData } from "../../api/friends-api";
import { sharingChoice } from "../../parts/sharing-panel/sharing-panel";
import { AddFriendLayer } from "./friend-layers/add-friend-layer/add-friend-layer";
import { HelpLayer, ListLayers } from "./friend-layers/friend-layers";
import {
  ExchangeTiles,
  HelpOpener,
  LayerCountRow,
  LayerRow,
  countMeta,
  newsMeta,
  requestsMeta,
  type TileCount,
} from "./friend-tiles/friend-tiles";
import { useTileCounts, type Options, type Token } from "./tile-counts/use-tile-counts";
import { FriendsPageSkeleton } from "./friends-page-body/friends-page-body";
import { FriendList } from "../../parts/friend-list/friend-list";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../social.de.json";

/** The cached read of the friends page; a friend's page that ends a friendship reloads it (US-QS-32). */
export const FRIENDS_KEY = ["social", "friends"] as const;
const tx = texts(table);

/** The two counted rows on top (issue 2419): the requests that wait for my answer and the new plants of friends; each opens its layer. */
function CountedRows(props: { requests: TileCount; news: TileCount }) {
  return (
    <GroupedList>
      <LayerCountRow
        id="requests"
        name={tx("layers.requests")}
        meta={countMeta(props.requests, requestsMeta)}
      />
      <LayerCountRow id="news" name={tx("layers.news")} meta={countMeta(props.news, newsMeta)} />
    </GroupedList>
  );
}

function Body(props: {
  data: FriendsData;
  api: string;
  token: Token;
  onWritten: () => void;
  options: Options;
}) {
  const { api, token, data, options } = props;
  const { news, offers, matching } = useTileCounts(api, token, options);
  const add = useLayer("add");
  const requests: TileCount = options.calm ? "hidden" : data.requests.incoming.length;
  const none = data.friends.length === 0;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {/* Without a friend the empty state below carries "Freund hinzufügen": the action shows once (SG-STATE-01). */}
      {none ? null : (
        <Button
          type="button"
          size="touch"
          className="sm:self-start"
          aria-haspopup="dialog"
          aria-expanded={add.open}
          onClick={(event) => add.openLayer(event.currentTarget)}
        >
          {tx("friendsPage.add")}
        </Button>
      )}
      {/* The page under the title and the action scrolls as one region: the list of friends is its main part, and the rows before and after it scroll with it (US-QS-15, SG-LIST-01). */}
      <ScrollRegion label={tx("friendsPage.region")} className="gap-4">
        <CountedRows requests={requests} news={news} />
        <FriendList friends={data.friends} />
        <ExchangeTiles counts={{ offers, matching }} swapMark={options.swapMark} />
        <LayerRow
          id="sharing"
          name={tx("layers.sharing")}
          state={sharingChoice(data.specimens, data.shared)}
        />
        <p className="text-sm text-muted-foreground">
          {tx("friendsPage.help")} <HelpOpener />
        </p>
      </ScrollRegion>
      <AddFriendLayer api={api} token={token} onWritten={props.onWritten} />
      <ListLayers api={api} token={token} data={data} onWritten={props.onWritten} />
      <HelpLayer />
    </div>
  );
}

/**
 * The page "Freunde" as one screen (US-QS-20, US-SOZ-01, US-SOZ-02, US-QS-15, issue 2419): the one filled action "Freund
 * hinzufügen", two counted rows for the requests and the news, the section "Meine Freunde · n" with the friends as one
 * scrolling list (the empty state when there is none), tiles for the exchange and the matching offers, a row for what
 * friends see and one line of help. The requests, the news, the adding, the sharing and the help open as layers
 * (`?sheet=add|requests|news|sharing|help`). Nothing here shows a friend's collection: private by default (P-05), and there
 * are no rankings between friends. A write reloads everything (P-10). Calm mode shows the rows without counts.
 */
export function FriendsPage(props: {
  api: string;
  token: Token;
  calm?: boolean;
  /** The text mark of the locked exchange (US-ONB-05). */
  swapMark?: string;
}) {
  const { api, token } = props;
  const options: Options = { calm: props.calm ?? false, swapMark: props.swapMark };
  const reload = useInvalidate(FRIENDS_KEY);
  const load = useCallback((t: string) => loadFriends(api, t), [api]);
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <section
        aria-labelledby="friends-title"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      >
        {/* The title is the page's header: in the top bar below md (US-QS-32, SG-HEAD-01). */}
        <PageHeader headingId="friends-title" title={tx("friendsPage.title")} />
        <LoadFrame
          queryKey={FRIENDS_KEY}
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
    </LayerHost>
  );
}
