import { useMemo } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { useRequest, useRequestPages, type ApiError } from "../../../shared/data";
import { COLLECTION_KEY, type Token } from "../hooks/use-collection";
import { loadAllCardsOf, loadCardPage, type CardFilter } from "./cards-api";

/** The plants of one filter as the page holds them (FR-BES-23): `cards` are the loaded ones, `total` counts all of them. */
export type CardPages = {
  /** "pending" until the first page is there; "error" when it failed and nothing is loaded (the view fails as a whole). */
  status: "pending" | "error" | "ready";
  /** The failure of the first page, or of a further one while the loaded cards stay on screen (P-10). */
  error: ApiError | undefined;
  cards: readonly SpecimenCard[];
  /** The server total of the filter; `undefined` until the first page is there (P-08: never a count of the loaded cards). */
  total: number | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
};

/**
 * The plants of one filter, read page by page (US-BES-06, FR-BES-23). The key starts with `COLLECTION_KEY`, so a write
 * that invalidates the collection refreshes the loaded pages and the total together. Nothing is read while `enabled` is
 * `false` (a group that is not chosen loads nothing).
 */
export function useCardPages(
  api: string,
  token: Token,
  filter: CardFilter = {},
  enabled = true,
): CardPages {
  const request = useRequestPages({
    queryKey: [...COLLECTION_KEY, "cards", filter],
    token,
    enabled,
    load: (t, after) =>
      loadCardPage(api, t, { ...filter, ...(after === undefined ? {} : { after }) }),
  });
  const { pages } = request;
  const cards = useMemo(() => pages.flatMap((p) => p.cards), [pages]);
  return {
    status: request.status,
    error: request.error,
    cards,
    total: pages.at(-1)?.total,
    hasMore: request.hasMore,
    loadingMore: request.loadingMore,
    loadMore: request.loadMore,
    retry: request.retry,
  };
}

/** Every active plant of one species (US-BES-03): the marker rule of the create form needs all of them, not one page. */
export function useSiblings(api: string, token: Token, speciesId: string) {
  return useRequest({
    queryKey: [...COLLECTION_KEY, "siblings", speciesId],
    token,
    load: (t) => loadAllCardsOf(api, t, speciesId),
  });
}
