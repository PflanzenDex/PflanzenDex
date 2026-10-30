import { useCallback, useState } from "react";
import { Link } from "react-router";
import type { FriendCard as Card } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { useIsShort } from "@/components/shared/responsive/pager/card-page-size";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useIsLg, useIsMd } from "@/lib/use-breakpoint";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, useRequest, useWriteAction } from "../../../kernel";
import { errorText } from "@/lib/error-text";
import { addToWishlist, loadFriendCollection } from "../../api/friends-api";
import { nameOf } from "../../parts/request-list/request-list";
import { FriendEquipment } from "./friend-equipment/friend-equipment";
import { FriendCard } from "./friend-card/friend-card";
import { FriendCollectionSkeleton } from "./friend-collection.skeleton";

const EQUIPMENT_LAYER = "equipment";

/** "Geräte" opens the devices the friend shares in a layer (US-EQU-12), so they no longer stand below the cards. */
function EquipmentOpener() {
  const layer = useLayer(EQUIPMENT_LAYER);
  return (
    <Button
      type="button"
      variant="outline"
      size="touch"
      className="min-w-0 flex-1 px-2 text-sm"
      aria-haspopup="dialog"
      onClick={(event) => layer.openLayer(event.currentTarget)}
    >
      Geräte
    </Button>
  );
}

type Filter = "all" | "lack" | "both";
const FILTERS = [
  { value: "all", label: "Alle" },
  { value: "lack", label: "Ich habe nicht" },
  { value: "both", label: "Wir haben beide" },
] as const;

/** Cards per page (starting values, assumption; the page size from the free height is #1029): 2 columns below 768 px (2 cards on a short phone, 4 otherwise), 3 from 768 px, 4 from 1024 px. */
function usePageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  const short = useIsShort();
  return lg ? 16 : md ? 12 : short ? 2 : 4;
}

/** "Claras Sammlung", "Lars' Sammlung": the German genitive of a name; an unknown name stays unknown (P-08). */
export const collectionTitle = (name: string | null): string =>
  name === null || name.trim() === ""
    ? "Sammlung eines Freundes"
    : `${/[sßxz]$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}s`} Sammlung`;

const visible = (cards: readonly Card[], filter: Filter) =>
  filter === "all" ? cards : cards.filter((c) => c.iHave === (filter === "both"));

/** What to do next in every state (P-09). */
function Next(props: { total: number; shown: number; filter: Filter; name: string }) {
  if (props.total === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-3">
        {props.name} hat noch nichts freigegeben. Frag nach, ob {props.name} Pflanzen unter „Was
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
  const size = usePageSize();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Freigegeben von {name}: nur Art, Anzahl und Fangdatum, keine Wertung und keinen Vergleich.
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
        <Pager
          items={shown}
          pageSize={size}
          label={`Sammlung von ${name}`}
          resetKey={filter}
          getKey={(c) => c.speciesLatin ?? `${c.speciesGerman}-${c.firstCaught}`}
          listClassName="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4"
          renderItem={(c) => (
            <FriendCard
              card={c}
              busy={wish.running}
              onWish={(card) =>
                void wish.run(
                  (t) => addToWishlist(props.api, t, card.speciesLatin ?? ""),
                  `${card.speciesLatin} steht jetzt auf deiner Wunschliste.`,
                )
              }
            />
          )}
        />
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
  const queryKey = ["social", "friend-collection", friendId];
  // The same request as the frame below shares one cached copy: the heading names the friend once it is there (US-QS-20).
  const loaded = useRequest({ queryKey, token: props.token, load });
  const equipment = useLayer(EQUIPMENT_LAYER);
  const title = collectionTitle(loaded.value?.friend.name ?? null);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 text-card-foreground md:p-7">
      <section aria-labelledby="friend-collection-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex gap-2">
          <Button asChild variant="outline" size="touch" className="min-w-0 flex-1 px-2 text-sm">
            <Link to="/friends">Zurück zu Freunde</Link>
          </Button>
          <EquipmentOpener />
        </div>
        <h1 id="friend-collection-title" className="text-2xl font-semibold">
          {title}
        </h1>
        <LoadFrame
          queryKey={queryKey}
          token={props.token}
          load={load}
          loadingText="Sammlung wird geladen …"
          loadingFallback={<FriendCollectionSkeleton label="Sammlung wird geladen …" />}
          heading="Sammlung eines Freundes"
        >
          {(data) => (
            <div className="flex min-w-0 gap-4">
              <div className="min-w-0 flex-1">
                <Body name={data.friend.name} cards={data.cards} api={api} token={props.token} />
              </div>
              <LayerSheet id={EQUIPMENT_LAYER} title={`Geräte von ${nameOf(data.friend.name)}`}>
                {equipment.open ? (
                  <FriendEquipment
                    api={api}
                    token={props.token}
                    friendId={friendId}
                    name={nameOf(data.friend.name)}
                  />
                ) : null}
              </LayerSheet>
            </div>
          )}
        </LoadFrame>
      </section>
    </div>
  );
}
