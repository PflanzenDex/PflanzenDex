import type { Key, ReactNode } from "react";
import { GroupChoices, usePart } from "./group-choices/group-choices";
import { Pager } from "../pager/pager";

export type PagedGroup<T> = { key: string; label: string; items: readonly T[] };

/**
 * Groups chosen from a row of choices with their counts, and the entries of the chosen group as pages (US-QS-19,
 * DS-60): the group is in the address (`part=`), the page in `?page=n`, a changed group starts at page 1. `intro` is
 * shown between the choices and the entries, e.g. the zone of the location or a group action.
 */
export function PagedGroups<T>(props: {
  /** Accessible name of the row of choices (German). */
  choicesLabel: string;
  /** Accessible name of the list of entries (German). */
  listLabel: string;
  groups: readonly PagedGroup<T>[];
  pageSize: number;
  renderItem: (item: T) => ReactNode;
  getKey: (item: T) => Key;
  listClassName?: string;
  intro?: (group: PagedGroup<T>) => ReactNode;
}) {
  const choices = props.groups.map((g) => ({ key: g.key, label: g.label, count: g.items.length }));
  const chosen = usePart(choices);
  const group = props.groups.find((g) => g.key === chosen?.key);
  return (
    <div className="flex flex-col gap-2">
      <GroupChoices label={props.choicesLabel} choices={choices} />
      {group ? props.intro?.(group) : null}
      <Pager
        items={group?.items ?? []}
        pageSize={props.pageSize}
        label={props.listLabel}
        resetKey={group?.key ?? ""}
        getKey={props.getKey}
        {...(props.listClassName ? { listClassName: props.listClassName } : {})}
        renderItem={props.renderItem}
      />
    </div>
  );
}
