import * as React from "react";
import { useLocation, useSearchParams } from "react-router";
import { LIST_PARTS, dropPageParts, pagedIn } from "../address";

/**
 * A scrolling list holds no position in the address (SG-NAV-02, SG-LIST-01): an old address with `?from=n`, `?page=n` or
 * another part of `LIST_PARTS` (and its old page number, `OLD_PARTS`) loses those parts once, when the list appears, and
 * the list starts at its first entry. The part leaves the current history entry (`replace`, no new entry) and the history
 * state stays, so a layer still closes by going back (`useLayer`). Other parts of the address stay as they are. A list in
 * a layer scrolls too, so with a layer open (`?sheet=`) its own part (`lfrom`) goes as well (issue 2418).
 */
export function useStripOldPositions(): void {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (!LIST_PARTS.some((part) => pagedIn(params, part))) return;
    const next = new URLSearchParams(params);
    dropPageParts(next, ...LIST_PARTS);
    setParams(next, { replace: true, state });
  }, [params, setParams, state]);
}
