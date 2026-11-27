import type { CollectorCard as Card } from "@pflanzendex/core";
import { useCallback } from "react";
import { call, currentTimeZone, type Response } from "@/shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { CollectorCard } from "../collector-card/collector-card";
import { CardRow } from "@/shared/patterns/display/card-row/card-row";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./collector-cards.de.json";
import { CollectorCardsSkeleton } from "./collector-cards.skeleton";

const ui = texts(table);

/** Loads the collector cards (US-POK-01): the taxonomy tree with the derived ownership, in the zone of the profile. */
async function loadCards(api: string, token: string): Promise<Response<Card[]>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  const r = await call<{ cards: Card[] }>(
    fetch,
    `${api}/pokedex/cards?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.cards } : r;
}

/**
 * The collector cards of the taxonomy tree (US-POK-01) as a card row, shown in their layer (US-QS-22, US-QS-15, issue 2421): a
 * sideways shelf with the next card peeking in, never pages. Caught species are colored, the others show as "missing" cards.
 * Caught is derived live by the server from the specimens, never stored (P-01).
 */
export function CollectorCards(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadCards(api, t), [api]);
  return (
    <section aria-labelledby="collector-cards-title" className="flex min-h-0 flex-1 flex-col">
      <h2 id="collector-cards-title" className="sr-only">
        {ui("title")}
      </h2>
      <LoadFrame
        queryKey={["pokedex", "cards"]}
        token={token}
        load={load}
        loadingText={ui("loading")}
        loadingFallback={<CollectorCardsSkeleton label={ui("loading")} />}
        empty={{
          isEmpty: (cards: Card[]) => cards.length === 0,
          title: ui("empty.title"),
          description: ui("empty.description"),
          action: { label: ui("empty.action"), href: "/species" },
        }}
      >
        {(cards: Card[]) => (
          <CardRow label={ui("row")}>
            {cards.map((c) => (
              <CollectorCard key={c.species} card={c} />
            ))}
          </CardRow>
        )}
      </LoadFrame>
    </section>
  );
}
