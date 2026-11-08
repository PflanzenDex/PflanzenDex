import { useEffect, useRef, type ReactNode } from "react";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { Anniversaries, useAnniversaries } from "../anniversaries";
import table from "../anniversaries.de.json";

const t = texts(table);
type Token = () => Promise<string | undefined>;
/** The value of `?sheet=` of the layer behind the tile on "Heute" (US-ACH-06, issue 1662). */
const LAYER = "anniversaries";

/**
 * The anniversaries of today as one tile on "Heute" (US-ACH-06, issue 1662): `tile` gets the count and the name, the area
 * draws it like its other tiles. Nothing while there is no anniversary, while it loads, in calm mode or when it fails
 * (US-ACH-08): a side feature never breaks the page, and the tile does not appear and vanish again.
 */
export function AnniversaryTile(props: {
  api: string;
  token: Token;
  tile: (count: number, label: string, layer: string) => ReactNode;
}) {
  const { items } = useEntries(props.api, props.token);
  return items.length > 0 ? <>{props.tile(items.length, t("tile.label"), LAYER)}</> : null;
}

/**
 * The layer behind the tile (`?sheet=anniversaries`): the entries with their text, photos and "Zur Sammlung", as on the
 * former card. An address with no anniversary left (an old link, or a calm mode switched on meanwhile) is closed instead
 * of showing an empty layer (P-10, as the new plants of friends).
 */
export function AnniversaryLayer(props: { api: string; token: Token; onOpen: () => void }) {
  const { ready, items } = useEntries(props.api, props.token);
  const { open, closeLayer } = useLayer(LAYER);
  const stale = open && ready && items.length === 0;
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
    <LayerSheet id={LAYER} title={t("layer.title")}>
      <Anniversaries api={props.api} token={props.token} onOpen={props.onOpen} />
    </LayerSheet>
  );
}

/** The entries of today (none in calm mode or while nothing is loaded), and whether the answer is there. */
function useEntries(api: string, token: Token) {
  const request = useAnniversaries(api, token);
  const value = request.value;
  const items = value && !value.calmMode && Array.isArray(value.items) ? value.items : [];
  return { ready: request.status === "ready", items };
}
