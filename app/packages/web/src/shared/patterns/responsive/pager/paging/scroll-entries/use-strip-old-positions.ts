import * as React from "react";
import { useLocation, useSearchParams } from "react-router";
import { PAGE_PARAM, PAGER_PARTS, dropPageParts, pagedIn } from "../address";
import { PARAM as LAYER_QUERY } from "../../../layer-sheet/use-layer.history";

/**
 * A scrolling list holds no position in the address (SG-NAV-02, SG-LIST-01): an old address with `?from=n`, `?page=n` or
 * another part of `PAGER_PARTS` (and its old page number, `OLD_PARTS`) loses those parts once, when the list appears, and
 * the list starts at its first entry. The part leaves the current history entry (`replace`, no new entry) and the history
 * state stays, so a layer still closes by going back (`useLayer`). Other parts of the address stay as they are.
 *
 * With a layer open (`?sheet=`) only `from` and `page` go: the other parts may be the position of the layer's own list,
 * which keeps its pages until the layers scroll too (issue 1861), and a reload with the layer open must find it again.
 */
export function useStripOldPositions(): void {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    const parts: readonly string[] = params.has(LAYER_QUERY) ? [PAGE_PARAM] : PAGER_PARTS;
    if (!parts.some((part) => pagedIn(params, part))) return;
    const next = new URLSearchParams(params);
    dropPageParts(next, ...parts);
    setParams(next, { replace: true, state });
  }, [params, setParams, state]);
}
