import { useCallback, useState } from "react";
import { Link } from "react-router";
import type { FriendCard as Card } from "@pflanzendex/core";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { Button } from "@/components/ui/button";
import { LoadFrame, useWriteAction } from "../../../kernel";
import { errorText } from "@/lib/error-text";
import { addToWishlist, loadFriendCollection } from "../../api/friends-api";
import { nameOf } from "../../parts/request-list/request-list";
import { FriendCard } from "./friend-card/friend-card";
import { FriendCollectionSkeleton } from "./friend-collection.skeleton";

type Filter = "all" | "lack" | "both";
const FILTERS = [
  { value: "all", label: "Alle" },
  { value: "lack", label: "Ich habe nicht" },
  { value: "both", label: "Wir haben beide" },
] as const;

const visible = (cards: readonly Card[], filter: Filter) =>
  filter === "all" ? cards : cards.filter((c) => c.iHave === (filter === "both"));

/** What to do next in every state (P-09). */
function Next(props: { total: number; shown: number; filter: Filter; name: string }) {
  if (props.total === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-3">
        {props.name} hat noch nichts freigegeben. Frag nach, ob {props.name} Exemplare unter „Was
        Freunde sehen“ freigibt, und gib selbst etwas frei.
      </p>
    );
  if (props.shown === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-3">
        {props.filter === "lack"
          ? "Du hast schon alle Arten, die dieser Freund teilt."
          : "Ihr habt keine gemeinsame Art."}{" "}
        Wähle „Alle“, um die ganze freigegebene Sammlung zu sehen.
      </p>
    );
  return null;
}

function Body(props: {
  name: string | null;
  cards: readonly Card[];
  api: string;
  token: () => Promise<string | undefined>;
}) {
  const wish = useWriteAction(props.token, () => undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = visible(props.cards, filter);
  const name = nameOf(props.name);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground">
        Das ist die freigegebene Sammlung von {name}: nur Art, Anzahl und Fangdatum. Es gibt keine
        Wertung und keinen Vergleich der Sammlungen untereinander. Die Geräte eines Freundes
        (US-EQU-12) folgen später.
      </p>
      <SegmentedControl label="Filter" options={FILTERS} value={filter} onChange={setFilter} />
      {wish.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {wish.message}
        </p>
      )}
      {wish.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(wish.error.code)}
        </p>
      )}
      <Next total={props.cards.length} shown={shown.length} filter={filter} name={name} />
      {shown.length > 0 && (
        <ul
          className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={`Sammlung von ${name}`}
        >
          {shown.map((c) => (
            <FriendCard
              key={c.speciesLatin ?? `${c.speciesGerman}-${c.firstCaught}`}
              card={c}
              busy={wish.running}
              onWish={(card) =>
                void wish.run(
                  (t) => addToWishlist(props.api, t, card.speciesLatin ?? ""),
                  `${card.speciesLatin} steht jetzt auf deiner Wunschliste.`,
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The shared collection of one friend (US-SOZ-07): collector cards of the species the friend shares, with "you have it" or
 * "you don't have it" from my own collection, and the filters "Ich habe nicht" and "Wir haben beide". Only what the friend
 * shares (P-05); no rank, no rating (FR-SOZ-11); unknown stays unknown (P-08).
 */
export function FriendCollectionPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friendId: string;
}) {
  const { api, friendId } = props;
  const load = useCallback((t: string) => loadFriendCollection(api, t, friendId), [api, friendId]);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <section aria-labelledby="friend-collection-title" className="flex min-w-0 flex-col gap-3">
        <div>
          <Button asChild variant="outline" size="touch">
            <Link to="/friends">Zurück zu Freunde</Link>
          </Button>
        </div>
        <h1 id="friend-collection-title" className="text-2xl font-semibold">
          Sammlung eines Freundes
        </h1>
        <LoadFrame
          queryKey={["social", "friend-collection", friendId]}
          token={props.token}
          load={load}
          loadingText="Sammlung wird geladen …"
          loadingFallback={<FriendCollectionSkeleton label="Sammlung wird geladen …" />}
          heading="Sammlung eines Freundes"
        >
          {(data) => (
            <Body name={data.friend.name} cards={data.cards} api={api} token={props.token} />
          )}
        </LoadFrame>
      </section>
    </div>
  );
}
