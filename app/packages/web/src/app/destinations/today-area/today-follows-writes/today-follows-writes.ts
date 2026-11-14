import { useEffect } from "react";
import type { QueryKey } from "@tanstack/react-query";
import type { TodayKind } from "@pflanzendex/core";
import { useQueryClient } from "@/shared/data";
import { TODAY_LIST_KEY } from "@/today";

// The first key part of each module's queries: the keys of a module start with it, so one prefix covers its data.
const CARE = ["care"] as const; // treatments, care phases, measurements
const COLLECTION = ["collection"] as const; // specimens and their hints
const LIGHT = ["light"] as const; // light zones and locations
const WISHLIST = ["wishlist"] as const; // the candidates of the buffer
const EQUIPMENT = ["equipment"] as const; // devices and their checks

/**
 * What each kind of the list of "Heute" derives from (core `todayStatus`, TE-07). Typed per kind, so a new kind has to name
 * its sources. Watering (`monitoring`) is in no kind: a watering changes no card, so it does not load the list again.
 */
const SOURCES: Record<TodayKind, readonly QueryKey[]> = {
  treatment_overdue: [CARE, COLLECTION],
  treatment_due: [CARE, COLLECTION],
  phase_deviation: [CARE, COLLECTION, LIGHT],
  measurement_etiolated: [CARE, COLLECTION],
  specimen_incomplete: [COLLECTION, LIGHT],
  buffer_low: [WISHLIST, LIGHT],
  equipment_check_due: [EQUIPMENT],
};
const WATCHED: readonly QueryKey[] = [...new Set(Object.values(SOURCES).flat())];

const startsWith = (key: QueryKey, root: QueryKey): boolean =>
  root.every((part, i) => key[i] === part);

/**
 * "Heute" follows the writes that change its list (SG-FEED-01, US-QS-18): when a query of a module the list derives from is
 * invalidated, the list loads again. One rule for every writer (the sheets of the area, the plant detail, the collection),
 * so no write has to name "Heute". Only an invalidation counts, because a refetch is the answer to one; the list never
 * reacts to its own key (no loop); several sources of one write load the list once.
 *
 * The cache announces an invalidation only while the query is not invalidated yet. A source a sheet of "Heute" writes is
 * observed by that sheet's own count, so it is refetched at once and the next write is announced too.
 */
export function useTodayFollowsWrites(): void {
  const client = useQueryClient();
  useEffect(() => {
    let due = false;
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "invalidate") return;
      const key = event.query.queryKey;
      if (key[0] === TODAY_LIST_KEY[0] || due) return;
      if (!WATCHED.some((root) => startsWith(key, root))) return;
      due = true;
      queueMicrotask(() => {
        due = false;
        void client.invalidateQueries({ queryKey: TODAY_LIST_KEY, exact: true });
      });
    });
    return unsubscribe;
  }, [client]);
}
