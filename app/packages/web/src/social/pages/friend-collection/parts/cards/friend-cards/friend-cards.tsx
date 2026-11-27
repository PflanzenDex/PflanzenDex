import { useState } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import type { FriendCard as Card } from "@pflanzendex/core";
import { useIsShort } from "@/shared/patterns/responsive/entry-list/card-page-size";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { useIsLg } from "@/shared/platform/visibility/use-lg-breakpoint";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { createKey, useWriteAction } from "../../../../../../shared/data";
import { addToWishlist } from "../../../../../api/friends-api";
import { FriendCard } from "../friend-card/friend-card";
import table from "../../../../../social.de.json";

const tx = texts(table);

type Filter = "all" | "lack" | "both";
const FILTERS = [
  { value: "all", label: tx("friendCollection.filterAll") },
  { value: "lack", label: tx("friendCollection.filterLack") },
  { value: "both", label: tx("friendCollection.filterBoth") },
] as const;

/** Cards per page (starting values, assumption; the page size from the free height is #1029): 2 columns below 768 px (2 cards on a short phone, 4 otherwise), 3 from 768 px, 4 from 1024 px. */
function usePageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  const short = useIsShort();
  return lg ? 16 : md ? 12 : short ? 2 : 4;
}

const visible = (cards: readonly Card[], filter: Filter) =>
  filter === "all" ? cards : cards.filter((c) => c.iHave === (filter === "both"));

/** What to do next in every state (P-09). */
function Next(props: { total: number; shown: number; filter: Filter; name: string }) {
  if (props.total === 0)
    return (
      <EmptySection
        text={tx("friendCollection.none", { name: props.name })}
        action={{ label: tx("friendCollection.share"), href: `${PATHS.friends}?sheet=sharing` }}
      />
    );
  if (props.shown === 0)
    return (
      <EmptySection
        text={
          props.filter === "lack"
            ? tx("friendCollection.allShared")
            : tx("friendCollection.noCommon")
        }
      />
    );
  return null;
}

/** The outcome of a wish that is put on the wishlist (US-SOZ-07): what changed, or the refusal (P-10). */
function WishNotice(props: {
  message: string | null;
  error: { code: string; dismiss?: (() => void) | undefined } | null;
}) {
  return (
    <>
      {props.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {props.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(props.error.code)}
          <RefusalClose error={props.error} />
        </p>
      )}
    </>
  );
}

/**
 * The cards of one friend's collection (US-SOZ-07): the line of what is shared, the filters "Alle", "Fehlen dir" and "Hast du
 * auch", the empty states and the pages of cards; a species that is missing goes to the wishlist (US-SOZ-07).
 */
export function FriendCards(props: {
  name: string;
  cards: readonly Card[];
  api: string;
  token: () => Promise<string | undefined>;
}) {
  const wish = useWriteAction(props.token, () => undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = visible(props.cards, filter);
  const size = usePageSize();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* One line naming only what the friend shares (US-QS-32, F-0265), without the name: the title names the friend, and a long
          name must not wrap the line at 360 px. None while nothing is shared. */}
      {props.cards.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {tx("friendCollection.sharedLine", { fields: tx("collection.shares") })}
        </p>
      ) : null}
      <SegmentedControl
        label={tx("friendCollection.filterLabel")}
        options={FILTERS}
        value={filter}
        onChange={setFilter}
      />
      <WishNotice message={wish.message} error={wish.error} />
      <Next total={props.cards.length} shown={shown.length} filter={filter} name={props.name} />
      {shown.length > 0 && (
        <ScrollEntries
          items={shown}
          pageSize={size}
          label={tx("friendCollection.list", { name: props.name })}
          resetKey={filter}
          getKey={(c) => c.speciesLatin ?? `${c.speciesGerman}-${c.firstCaught}`}
          listClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2 md:grid-cols-3 lg:grid-cols-4"
          renderItem={(c) => (
            <FriendCard
              card={c}
              busy={wish.running}
              onWish={(card) =>
                void wish.run(
                  (t, opts) => addToWishlist(props.api, t, card.speciesLatin ?? "", opts),
                  tx("friendCollection.wishAdded", { name: card.speciesLatin ?? "" }),
                  // A create (a wish is added from a friend's card): the operation only, the species is the body (US-QS-03).
                  createKey("wish", "add"),
                )
              }
            />
          )}
        />
      )}
    </div>
  );
}
