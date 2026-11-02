import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { texts } from "@/lib/text-rules/texts";
import table from "../../../shell.de.json";
import { isShownLocked } from "../../model/unlock-texts";
import { useUnlocks } from "../../model/unlocks/unlocks";
import { LockedRows } from "../locked-rows";

const t = texts(table);
/** The value of `?sheet=` of the layer with the locked functions. */
const LAYER = "locked";

/**
 * An address `?sheet=locked` with nothing locked (an old link, or the last function was opened meanwhile) has no layer
 * behind it: it is taken out of the address, so the page shows what it shows (US-QS-18). Nothing happens while the
 * lock states are loading or failing, because then nothing is known to be open.
 */
function useDropStaleLockedSheet(): void {
  const { status, entries } = useUnlocks();
  const [params, setParams] = useSearchParams();
  const stale = status === "ready" && params.get("sheet") === LAYER && !entries.some(isShownLocked);
  useEffect(() => {
    if (!stale) return;
    const next = new URLSearchParams(params);
    next.delete("sheet");
    setParams(next, { replace: true });
  }, [stale, params, setParams]);
}

/**
 * The locked functions as a tile of "Heute" (US-QS-18, issue 1156): `tile` gets the count, the name and the layer, the
 * area draws it like its other tiles. Nothing while nothing is locked. It lives in the shell's chunk, not the area's (QG-U6).
 */
export function LockedTile(props: {
  tile: (count: number, label: string, layer: string) => ReactNode;
}) {
  const n = useUnlocks().entries.filter(isShownLocked).length;
  return n === 0 ? null : <>{props.tile(n, t("locked.title"), LAYER)}</>;
}

/** The layer behind the tile (`?sheet=locked`) with the rows of the locked functions (US-ONB-05). */
export function LockedLayer() {
  const locked = useUnlocks().entries.filter(isShownLocked);
  useDropStaleLockedSheet();
  if (locked.length === 0) return null;
  return (
    <LayerSheet id={LAYER} title={t("locked.layer")}>
      <LockedRows inLayer />
    </LayerSheet>
  );
}
