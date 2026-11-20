import { useIsShort } from "@/shared/patterns/responsive/pager/card-page-size";
import type { Friend } from "@pflanzendex/core";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { Avatar } from "@/shared/patterns/display/avatar/avatar";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { dateText } from "../invite-card/invite-card";
import { nameOf } from "../request-list/request-list";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../social.de.json";

const tx = texts(table);

/** Friends per page in the layer (starting value, assumption; US-QS-20). */
const PAGE_SIZE = 3;
/** On a short phone (at most 700 px high) a page holds fewer friends (#1029 replaces this). */
const SHORT_PAGE_SIZE = 2;

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
 * The confirmed friends (US-SOZ-02, US-SOZ-03): display name, start, the number of shared caught species and the way to
 * the friend's shared collection (US-SOZ-07), one row per friend. Nothing from their collections here: what a friend sees
 * is decided per specimen, private by default (US-SOZ-04, P-05). No rankings. The number counts only what the friend
 * shares: "unbekannt" when nothing is shared, never 0 by guess (P-08).
 */
export function FriendList(props: { friends: readonly Friend[] }) {
  const short = useIsShort();
  // The empty list names its one step: the add-friend layer (US-QS-32, SG-STATE-01); the layer opens from here like FeedHint's.
  const add = useLayer("add");
  return (
    <section aria-label={tx("friendList.label")} className="flex min-w-0 flex-col gap-3">
      {props.friends.length === 0 ? (
        <EmptySection
          text={tx("friendList.none")}
          action={{ label: tx("friendList.add"), onClick: () => add.openLayer() }}
        />
      ) : (
        <Pager
          items={props.friends}
          pageSize={short ? SHORT_PAGE_SIZE : PAGE_SIZE}
          label={tx("friendList.pager")}
          getKey={(f) => f.id}
          listClassName={ROW_GROUP}
          renderItem={(f) => <FriendRow friend={f} />}
        />
      )}
    </section>
  );
}
