import type { CollectorCard as Card } from "@pflanzendex/core";
import { useCallback, useEffect, useRef } from "react";
import { call, currentTimeZone, type Response } from "@/shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { CollectorCard } from "../collector-card/collector-card";
import { CollectorDetailView } from "../collector-detail-view/collector-detail-view";
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
 * On the way back from the details the focus returns to the "Mehr" button of the card that was open (WCAG 2.4.3); the focus
 * brings the card into view of the shelf. `remember` names the card when its details open.
 */
function useFocusBack(detail: Card | null) {
  const root = useRef<HTMLElement>(null);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (detail !== null || opened.current === null) return;
    const species = opened.current;
    opened.current = null;
    const cards = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-species]") ?? []);
    cards
      .find((el) => el.dataset["species"] === species)
      ?.querySelector<HTMLElement>("button")
      ?.focus();
  }, [detail]);
  return { root, remember: (species: string) => void (opened.current = species) };
}

/** The shelf of the cards; "Mehr" of a card hands it to the sheet that holds the shelf (SG-SHEET-03). */
function Shelf(props: { cards: Card[]; onMore: (card: Card) => void }) {
  return (
    <CardRow label={ui("row")}>
      {props.cards.map((c) => (
        <CollectorCard key={c.species} card={c} onMore={props.onMore} />
      ))}
    </CardRow>
  );
}

/**
 * The collector cards of the taxonomy tree (US-POK-01) as a card row, shown in their layer (US-QS-22, US-QS-15, issue 2421): a
 * sideways shelf with the next card peeking in, never pages. Caught species are colored, the others show as "missing" cards.
 * Caught is derived live by the server from the specimens, never stored (P-01). "Mehr" on a card puts its details in the place
 * of the shelf (`detail`, `CollectorDetailView`), because the cards stand in a sheet and a sheet never opens a second sheet
 * (SG-SHEET-03, owner decision d-163); the way back puts the focus on the "Mehr" button of that card again.
 */
export function CollectorCards(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** The card whose details show instead of the shelf, or `null` for the shelf; the layer holds it, for its title. */
  detail: Card | null;
  onOpen: (card: Card) => void;
  onBack: () => void;
}) {
  const { api, token, detail } = props;
  const load = useCallback((t: string) => loadCards(api, t), [api]);
  const { root, remember } = useFocusBack(detail);
  return (
    <section
      ref={root}
      aria-labelledby="collector-cards-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <h2 id="collector-cards-title" className="sr-only">
        {ui("title")}
      </h2>
      {detail !== null ? (
        <CollectorDetailView card={detail} onBack={props.onBack} />
      ) : (
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
            <Shelf
              cards={cards}
              onMore={(card) => {
                remember(card.species);
                props.onOpen(card);
              }}
            />
          )}
        </LoadFrame>
      )}
    </section>
  );
}
