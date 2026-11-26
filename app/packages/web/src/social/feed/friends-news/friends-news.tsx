import { newRepeatKey } from "@/shared/data";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Banner } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { GroupSections } from "@/shared/lists/grouped-list/grouped-sections/grouped-sections";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { texts } from "@/shared/lib/text-rules/texts";
import { refusalText } from "@/shared/lib/error-text";
import { useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { markFeedSeen } from "../../api/feed-api";
import { NewPlantsAsOf } from "../friends-banner/friends-banner";
import { useNewPlants, type Token } from "../friends-banner/use-new-plants";
import { FriendsNewsSkeleton } from "./friends-news.skeleton";
import { groupsOf, NewsRowLink } from "./news-rows/news-rows";
import table from "../../social.de.json";

const t = texts(table);
/** The value of `?sheet=` of the layer on "Heute". */
const LAYER = "news";

/** There is something to show: plants that are new, or plants that were read within the window (US-SOZ-06). */
const hasNews = (b: Banner | null): b is Banner => b !== null && (b.count > 0 || b.read.length > 0);

/**
 * The new plants of friends as a tile on "Heute" (US-SOZ-06, US-QS-18, issue 1156): `tile` gets the count of the new plants
 * and the name, the area draws it like its other tiles. The tile stays while plants were read, so "Gelesen" in the layer
 * stays reachable (decision P4-C3); then its count is 0. Nothing while there is nothing to show, while it loads or when it
 * fails: the page "Freunde" says it (P-10), and a tile must not appear and vanish again.
 */
export function FriendsNewsTile(props: {
  api: string;
  token: Token;
  tile: (count: number, label: string, layer: string) => ReactNode;
}) {
  const { banner } = useNewPlants(props.api, props.token);
  return hasNews(banner) ? <>{props.tile(banner.count, t("news.title"), LAYER)}</> : null;
}

/** The rows asked for past the loaded ones in one step; the layer holds every row of the banner, so it asks for none. */
const PAGE_SIZE = 4;

/** The copy the layer showed, with the connection state it showed it in. */
type Copy = { banner: Banner; offline: boolean };
type Mark = (copy: Copy) => Promise<void>;

/** The text of a failed mark: the keeper learns the plants stay new, and why when the server refused (P-10). */
const failureText = (error?: Parameters<typeof refusalText>[0]) =>
  error ? `${t("news.markFailed")} ${refusalText(error)}` : t("news.markFailed");

/**
 * The mark of the copy the layer showed (US-SOZ-06, owner decision P4-C3): once per `asOf`, online, and only a copy with new
 * plants. It goes up to that copy's `asOf`, so what became visible later stays new. A failed or refused mark resets the
 * guard, so a later close sends again, and a toast says so (P-10). The shared banner reloads after every attempt, so the
 * tile still counts what is new.
 */
function useMarkRead(deps: { api: string; token: Token; reload: () => void }): Mark {
  const { api, token, reload } = deps;
  const toast = useToast();
  const sent = useRef<string | null>(null);
  return useCallback<Mark>(
    async (copy) => {
      if (copy.offline || copy.banner.count === 0) return;
      const asOf = copy.banner.asOf;
      if (sent.current === asOf) return;
      sent.current = asOf;
      try {
        const tk = await token();
        // A per-send key: marking the news seen is idempotent (seen up to asOf), and a failure is retried by the next view.
        const r = tk ? await markFeedSeen(api, tk, asOf, { key: newRepeatKey() }) : null;
        if (r?.ok) return;
        sent.current = null;
        toast.show({ message: failureText(r && !r.ok ? r.error : undefined), kind: "error" });
      } catch {
        sent.current = null;
        toast.show({ message: failureText(), kind: "error" });
      } finally {
        reload();
      }
    },
    [api, token, reload, toast],
  );
}

/**
 * Marks what the layer showed as read when it closes, by Back, the close button or the backdrop (US-SOZ-06). Not on open.
 * An unmount while the layer is open (a tap on the bottom bar, a link out of the page) counts as a close too. StrictMode and
 * a re-run of the effects unmount and mount back to back, so an unmount only counts when it stays: the check waits a
 * microtask. Offline and copies without new plants are left to `mark`, which sends nothing for them.
 */
function useMarkReadOnClose(mark: Mark, open: boolean, banner: Banner | null, offline: boolean) {
  const wasOpen = useRef(false);
  const onScreen = useRef<Copy | null>(null);
  const markRef = useRef(mark);
  useEffect(() => {
    markRef.current = mark;
  }, [mark]);
  useEffect(() => {
    if (open && banner) onScreen.current = { banner, offline };
  }, [open, banner, offline]);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    if (!was || open) return;
    const copy = onScreen.current;
    onScreen.current = null;
    if (copy) void mark(copy);
  }, [open, mark]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!wasOpen.current) return;
      queueMicrotask(() => {
        if (mounted.current) return;
        const copy = onScreen.current;
        onScreen.current = null;
        wasOpen.current = false;
        if (copy) void markRef.current(copy);
      });
    };
  }, []);
}

/**
 * The layer behind the tile (`?sheet=news`): what is new as flat grouped rows, one section per friend, and "Gelesen" with what
 * was read (US-QS-32), with "Stand" above them when the copy is older. It has no "Als gelesen markieren": closing the layer
 * marks what it showed as read (US-SOZ-06). An address `?sheet=news` with nothing to show (an old link, or seen meanwhile) is
 * closed the same way instead of showing an empty layer (US-QS-18).
 */
export function FriendsNewsLayer(props: { api: string; token: Token }) {
  const { status, offline, banner, reload } = useNewPlants(props.api, props.token);
  const { open, closeLayer } = useLayer(LAYER);
  const stale = open && status === "ready" && !hasNews(banner);
  // Closes once per stale address: Back must not run twice while the address changes.
  const closing = useRef(false);
  useEffect(() => {
    if (!stale) {
      closing.current = false;
      return;
    }
    if (closing.current) return;
    closing.current = true;
    closeLayer();
  }, [stale, closeLayer]);
  const mark = useMarkRead({ api: props.api, token: props.token, reload });
  useMarkReadOnClose(mark, open, banner, offline);
  return (
    <LayerSheet id={LAYER} title={t("news.title")}>
      {hasNews(banner) ? (
        // Every friend is a section of the layer's one scrolling list, "Gelesen" last (SG-LIST-06, US-QS-32).
        <div className="flex min-w-0 flex-col gap-3">
          {banner.count === 0 ? <p>{t("news.none")}</p> : null}
          <NewPlantsAsOf news={banner} offline={offline} />
          <GroupSections
            label={t("feed.list")}
            jumpLabel={t("news.groups")}
            in="layer"
            level={3}
            groups={groupsOf(banner)}
            list={{
              listLabel: t("feed.list"),
              pageSize: PAGE_SIZE,
              // The plant rows never shrink below their content (issue 2293, as the needs of issue 2272): the list gives every
              // row `shrink-0` (issue 2315), so a squeezed list cannot collapse a clipped row to its borders.
              listClassName: ROW_GROUP,
              getKey: (row) => row.key,
              renderItem: (row) => <NewsRowLink row={row} />,
            }}
          />
        </div>
      ) : status === "pending" ? (
        <FriendsNewsSkeleton rows={PAGE_SIZE} />
      ) : null}
    </LayerSheet>
  );
}
