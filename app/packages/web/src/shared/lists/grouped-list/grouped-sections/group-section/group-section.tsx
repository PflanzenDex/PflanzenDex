import { createContext, useContext, type Key, type ReactNode } from "react";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import type { EntriesPaging } from "@/shared/patterns/responsive/pager/paging/paging";
import { GroupedList } from "../../grouped-list";

/** One group of a grouped list: its entries, its count and what stands in its section (SG-LIST-06, SG-LIST-08). */
export type SectionGroup<T> = {
  key: string;
  /** The name of the group: the chip that jumps to it, and the start of its heading. */
  label: string;
  /** The heading when it is not "<label> · <count>", for example with a zone or a total that is not loaded yet. */
  heading?: ReactNode;
  items: readonly T[];
  /** All entries of the group on the server, when they are not all loaded (FR-BES-23); the heading and the chip show it. */
  count?: number;
  /**
   * What the count says in words, "5 Pflanzen" or "2 von 3" (US-ACH-02): the heading reads "Zone 3 · 5 Pflanzen" and the chip
   * "Zone 3 · 5 Pflanzen" instead of "Zone 3 (5)". Without it the count is a bare number.
   */
  countText?: string;
  /** The server paging of the group's entries (see `EntriesPaging`): each group loads and ends on its own. */
  paging?: EntriesPaging;
  /**
   * The quiet line of a group without entries (SG-LIST-06): a fixed set of groups shows every group in its order, an empty one
   * as this line, not styled as a control. Without it an empty group still shows its heading and no line.
   */
  empty?: string;
  /** Between the heading and the entries, for example a group action. */
  intro?: ReactNode;
  /** One plain action beside the heading (the group of an unknown value, "Standort setzen"). */
  action?: ReactNode;
};

/** How a section shows its entries (shared by every group of one list). */
export type SectionList<T> = {
  /** Accessible name of the list of one group (German). */
  listLabel: string;
  renderItem: (item: T) => ReactNode;
  getKey: (item: T) => Key;
  /** Entries asked for past the loaded ones in one step. */
  pageSize: number;
  listClassName?: string;
};

/** What every section of one grouped list shares: how its entries show, the heading level and the surface of the sticky heading. */
type Shared = { list: SectionList<never>; level: 2 | 3 | 4; sticky: "page" | "layer" };
export const SectionsContext = createContext<Shared | null>(null);

/** The count of a group: all on the server, at least the loaded ones. */
export const countOf = (group: Pick<SectionGroup<unknown>, "count" | "items">): number =>
  Math.max(group.count ?? 0, group.items.length);

/**
 * One group as a section of a long list (SG-LIST-06): a real heading with its count above its entries, one list per
 * group with the loader and retry rows of its own part (`ScrollEntries`, SG-LIST-01). The last section of the list carries the
 * end marker of the whole list (`end`, the count of every group): `false` for the others. The heading is sticky in the
 * region of the list. How the entries show comes from the `GroupSections` that holds the section.
 */
export function GroupSection<T>(props: { group: SectionGroup<T>; end?: number | false }) {
  const { group } = props;
  const shared = useContext(SectionsContext);
  if (shared === null) throw new Error("GroupSection stands inside GroupSections");
  const list = shared.list as SectionList<T>;
  // A group without entries, and none on their way, has no list: a fixed set says so in one quiet line (SG-LIST-06).
  const none = group.items.length === 0 && group.paging === undefined;
  return (
    <GroupedList
      free
      groupKey={group.key}
      level={shared.level}
      sticky={shared.sticky}
      label={group.heading ?? `${group.label} · ${group.countText ?? countOf(group)}`}
      {...(group.action === undefined ? {} : { action: group.action })}
    >
      {group.intro}
      {none ? (
        group.empty === undefined ? null : (
          <p className="m-0 text-sm text-muted-foreground">{group.empty}</p>
        )
      ) : (
        <ScrollEntries
          items={group.items}
          pageSize={list.pageSize}
          label={list.listLabel}
          resetKey={group.key}
          getKey={list.getKey}
          renderItem={list.renderItem}
          end={props.end ?? false}
          {...(list.listClassName ? { listClassName: list.listClassName } : {})}
          {...(group.paging ? { paging: group.paging } : {})}
        />
      )}
    </GroupedList>
  );
}
