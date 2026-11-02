import { useEffect, useRef, type ReactNode } from "react";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { texts } from "@/lib/text-rules/texts";
import { NewPlantsBody, useNewPlants } from "../friends-banner/friends-banner";
import table from "../../social.de.json";

const t = texts(table);
type Token = () => Promise<string | undefined>;
/** The value of `?sheet=` of the layer on "Heute". */
const LAYER = "news";

/**
 * The new plants of friends as a tile on "Heute" (US-SOZ-06, US-QS-18, issue 1156): `tile` gets the count and the name,
 * the area draws it like its other tiles. Nothing while there is nothing new, while it loads or when it fails: the page
 * "Freunde" says it (P-10), and a tile must not appear and vanish again.
 */
export function FriendsNewsTile(props: {
  api: string;
  token: Token;
  tile: (count: number, label: string, layer: string) => ReactNode;
}) {
  const { news } = useNewPlants(props.api, props.token);
  return news ? <>{props.tile(news.count, t("news.title"), LAYER)}</> : null;
}

/**
 * The layer behind the tile (`?sheet=news`): what is new, when it was read and "Okay". "Okay" closes it; an address
 * `?sheet=news` with nothing new (an old link, or seen meanwhile) is closed the same way instead of showing an empty
 * layer (US-QS-18).
 */
export function FriendsNewsLayer(props: { api: string; token: Token }) {
  const { status, offline, news, okay } = useNewPlants(props.api, props.token);
  const { open, closeLayer } = useLayer(LAYER);
  const stale = open && status === "ready" && !news;
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
  return (
    <LayerSheet id={LAYER} title={t("news.title")}>
      {news ? (
        <div className="flex min-w-0 flex-col gap-2">
          <NewPlantsBody api={props.api} news={news} offline={offline} okay={okay} />
        </div>
      ) : null}
    </LayerSheet>
  );
}
