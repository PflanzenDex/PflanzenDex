import { useLayoutEffect, useRef } from "react";
import {
  BELOW,
  FROM_APP as LAYER_FROM_APP,
} from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { FROM_APP, fallbackBelow, listSearch } from "./address/form-address";
import type { Latest, Ref } from "./address/use-form-history";

/**
 * A form opened without the app (a reload or a link) gets the plant's layer below it, and the list below that, so Back
 * returns to the plant and one more Back leaves to the list (US-QS-15, US-QS-32, owner answer Q-46). The layer is the
 * entry directly below the form, which a Back onto it holds the form on (issue 2145).
 */
export function useOrdering(latest: Ref<Latest>, fromApp: boolean, key: string, hasForm: boolean) {
  const ordering = useRef(false);
  useLayoutEffect(() => {
    const c = latest.current;
    if (!hasForm || fromApp) {
      ordering.current = false;
      return;
    }
    if (ordering.current) return;
    ordering.current = true;
    const { pathname, hash, search } = c.location;
    const list = listSearch(search);
    const layer = fallbackBelow(c.location, c.current?.plantId).search;
    void c.navigate({ pathname, search: list, hash }, { replace: true });
    void c.navigate(
      { pathname, search: layer, hash },
      { state: { [LAYER_FROM_APP]: true, [BELOW]: { pathname, search: list } } },
    );
    void c.navigate(
      { pathname, search, hash },
      { state: { [FROM_APP]: true, [BELOW]: { pathname, search: layer } } },
    );
  }, [key, fromApp, hasForm, latest]);
}
