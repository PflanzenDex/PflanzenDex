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
          <LockedRows />
        </LayerSheet>
      </div>
    </>
  );
}

/**
 * The locked functions on "Heute" (US-QS-18): nothing while nothing is locked, else the one row and its layer. It
 * lives in the chunk of the introduction and not in the shell (QG-U6).
 */
export function CollapsedLockedRows() {
  const locked = useUnlocks().entries.filter(isShownLocked);
  return locked.length === 0 ? null : <CollapsedRows n={locked.length} />;
}
