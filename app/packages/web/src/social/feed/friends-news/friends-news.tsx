import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Banner, BannerItem } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { markFeedSeen } from "../../api/feed-api";
import { itemText, NewPlantsText } from "../friends-banner/friends-banner";
import { useNewPlants, type Token } from "../friends-banner/use-new-plants";
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

/**
 * The plants that were new and got marked as seen within the read window (US-SOZ-06): read, not new, under the heading
 * "Gelesen" (a heading of the layer, one level below its title).
 */
function ReadPlants({ items }: { items: readonly BannerItem[] }) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-1">
      <h3 id={id} className="text-base font-semibold">
        {t("news.read")}
      </h3>
      <ul className="flex min-w-0 flex-col gap-1">
        {items.map((i, n) => (
          <li key={n}>{itemText(i)}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Marks what the layer showed as read when the layer closes, by Back, the close button or the backdrop (US-SOZ-06, owner
 * decision P4-C3). The mark goes up to the `asOf` of the copy on screen, so what became visible later stays new. Not on
 * open. Nothing while offline: the mark needs a connection, and the plants would still say "new" afterwards. Nothing when
 * the copy had no new plants, and a copy is sent once (a second close with nothing new sends nothing). A failed mark
 * leaves the plants new, and the tile still counts them (P-10).
 */
function useMarkReadOnClose(
  deps: { api: string; token: Token; reload: () => void },
  open: boolean,
  banner: Banner | null,
  offline: boolean,
) {
  const { api, token, reload } = deps;
  const wasOpen = useRef(false);
  const onScreen = useRef<{ banner: Banner; offline: boolean } | null>(null);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (open && banner) onScreen.current = { banner, offline };
  }, [open, banner, offline]);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    if (!was || open) return;
    const copy = onScreen.current;
    onScreen.current = null;
    if (!copy || copy.offline || copy.banner.count === 0) return;
    const asOf = copy.banner.asOf;
    if (sent.current === asOf) return;
    sent.current = asOf;
    void (async () => {
      const tk = await token();
      const r = tk ? await markFeedSeen(api, tk, asOf) : null;
      if (!r?.ok) sent.current = null;
      reload();
    })();
  }, [open, api, token, reload]);
}

/**
 * The layer behind the tile (`?sheet=news`): what is new with "Stand", and below it "Gelesen" with what was read. It has no
 * "Als gelesen markieren": closing the layer marks what it showed as read (US-SOZ-06). An address `?sheet=news` with nothing
 * to show (an old link, or seen meanwhile) is closed the same way instead of showing an empty layer (US-QS-18).
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
  useMarkReadOnClose({ api: props.api, token: props.token, reload }, open, banner, offline);
  return (
    <LayerSheet id={LAYER} title={t("news.title")}>
      {hasNews(banner) ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <NewPlantsText news={banner} offline={offline} />
          </div>
          <ReadPlants items={banner.read} />
        </div>
      ) : null}
    </LayerSheet>
  );
}
