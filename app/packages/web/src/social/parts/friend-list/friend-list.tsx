import { useId } from "react";
import type { Friend } from "@pflanzendex/core";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { Avatar } from "@/shared/patterns/display/avatar/avatar";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { dateText } from "../invite-card/invite-card";
import { nameOf } from "../request-list/request-list";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../social.de.json";

const tx = texts(table);

/**
 * One friend (US-QS-32, SG-TOUCH-02): the whole row is the link to the friend's shared collection, named by its visible
 * text (the name, then the meta line), and a chevron marks it. Ending the friendship lives on that collection's page.
 */
function FriendRow(props: { friend: Friend }) {
  const { friend: f } = props;
  const shared =
    f.sharedSpecies === null
      ? tx("friendList.sharedUnknown")
      : tx("friendList.shared", { count: f.sharedSpecies });
  return (
    <GroupedRow
      bare
      to={`/friends/${f.id}`}
      leading={<Avatar name={f.name ?? ""} decorative />}
      title={nameOf(f.name)}
      meta={`${tx("friendList.since", { date: dateText(f.since) })} · ${shared}`}
    />
  );
}

/**
 * The confirmed friends on the page "Freunde" (US-SOZ-02, US-SOZ-03, US-QS-15): the section "Meine Freunde · n" with one scrolling
 * list, display name, start, the number of shared caught species and the way to the friend's shared collection (US-SOZ-07),
 * one row per friend. Nothing from their collections here: what a friend sees is decided per specimen, private by default
 * (US-SOZ-04, P-05). No rankings. The number counts only what the friend shares: "unbekannt" when nothing is shared, never 0
 * by guess (P-08). The label carries no "· 0": without a friend the empty state names the next step, "Freund hinzufügen"
 * (P-09, SG-STATE-01). The list is `ScrollEntries`, every friend loaded.
 */
export function FriendList(props: { friends: readonly Friend[] }) {
  const heading = useId();
  // The empty state names its one step: the add-friend layer, which opens from here (US-QS-32, SG-STATE-01).
  const add = useLayer("add");
  if (props.friends.length === 0)
    return (
      <EmptyState
        title={tx("friendsPage.emptyTitle")}
        description={tx("friendsPage.emptyText")}
        action={{ label: tx("friendsPage.add"), onClick: () => add.openLayer() }}
      />
    );
  return (
    <section aria-labelledby={heading} className="flex min-w-0 flex-col gap-2">
      <h2 id={heading} className="text-base font-semibold text-foreground">
        {tx("friendsPage.friends", { count: props.friends.length.toLocaleString("de-DE") })}
      </h2>
      <ScrollEntries
        items={props.friends}
        pageSize={props.friends.length}
        label={tx("friendList.pager")}
        getKey={(f) => f.id}
        listClassName={ROW_GROUP}
        renderItem={(f) => <FriendRow friend={f} />}
      />
    </section>
  );
}
