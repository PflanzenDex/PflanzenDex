import { useEffect } from "react";
import { useSearchParams } from "react-router";
import {
  LAYER_SLOT,
  LayerOpener,
  LayerSheet,
} from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { isShownLocked } from "../../model/unlock-texts";
import { useUnlocks } from "../../model/unlocks/unlocks";
import { LockedRows } from "../locked-rows";

/** One row "n Funktionen noch nicht geöffnet" that opens the rows as a layer (US-QS-18, `?sheet=locked`). */
function CollapsedRows({ n }: { n: number }) {
  return (
    <>
      <LayerOpener id="locked" className="w-full justify-between">
        <span>{n === 1 ? "1\u00a0Funktion" : `${n}\u00a0Funktionen`} noch nicht geöffnet</span>
      </LayerOpener>
      <div className={LAYER_SLOT}>
        <LayerSheet id="locked" title="Weitere Funktionen">
          <LockedRows inLayer />
        </LayerSheet>
      </div>
    </>
  );
}

/**
 * An address `?sheet=locked` with nothing locked (an old link, or the last function was opened meanwhile) has no layer
 * behind it: it is taken out of the address, so the page shows what it shows (US-QS-18). Nothing happens while the
 * lock states are loading or failing, because then nothing is known to be open.
 */
function useDropStaleLockedSheet(): void {
  const { status, entries } = useUnlocks();
  const [params, setParams] = useSearchParams();
  const stale =
    status === "ready" && params.get("sheet") === "locked" && !entries.some(isShownLocked);
  useEffect(() => {
    if (!stale) return;
    const next = new URLSearchParams(params);
    next.delete("sheet");
    setParams(next, { replace: true });
  }, [stale, params, setParams]);
}

/**
 * The locked functions on "Heute" (US-QS-18): nothing while nothing is locked, else the one row and its layer. It
 * lives in the chunk of the introduction and not in the shell (QG-U6).
 */
export function CollapsedLockedRows() {
  const locked = useUnlocks().entries.filter(isShownLocked);
  useDropStaleLockedSheet();
  return locked.length === 0 ? null : <CollapsedRows n={locked.length} />;
}
