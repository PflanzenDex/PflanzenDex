import type { CollectorCard as Card } from "@pflanzendex/core";
import { useCallback } from "react";
import { call, currentTimeZone, LoadFrame, type Response } from "@/kernel";
import { CollectorCard } from "@/components/collector-card/collector-card";

/** Same grid as the caught species of the Pokédex page. */
const GRID = "m-0 mb-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3";

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
 * The collector cards of the taxonomy tree (US-POK-01): caught species colored, the others as "missing" cards. Caught is
 * derived live by the server from the specimens, never stored (P-01).
 */
export function CollectorCards(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadCards(api, t), [api]);
  return (
    <section aria-labelledby="collector-cards-title">
      <h2 id="collector-cards-title" className="mb-2 text-lg font-semibold">
        Sammlerkarten
      </h2>
      <LoadFrame
        queryKey={["pokedex", "cards"]}
        token={token}
        load={load}
        loadingText="Sammlerkarten werden geladen …"
        empty={{
          isEmpty: (cards: Card[]) => cards.length === 0,
          title: "Noch keine Sammlerkarten.",
          description: "Sie erscheinen, sobald der Katalog-Baum aufgebaut ist.",
          action: { label: "Zum Artenkatalog", href: "/species" },
        }}
      >
        {(cards: Card[]) => (
          <ul className={GRID} aria-label="Sammlerkarten">
            {cards.map((c) => (
              <CollectorCard key={c.species} card={c} />
            ))}
          </ul>
        )}
      </LoadFrame>
    </section>
  );
}
