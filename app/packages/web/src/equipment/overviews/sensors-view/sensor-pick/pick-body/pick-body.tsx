import { useRef, useState, type RefObject } from "react";
import type { SensorView } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { SearchInput } from "@/shared/ui/search-input";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../../equipment.de.json";
import type { Choice } from "../../sensor-target";
import { ENTRY, PickEntry, walkEntries } from "../pick-entry/pick-entry";
import { matching } from "../sensor-pick.filter";

const ui = texts(table);

type Places = Pick<SensorView, "specimens" | "locations">;

/** What the query leaves of the list. "Nicht zugeordnet" is an entry like the others: a query that does not match it hides it. */
function shownBy(view: Places, query: string) {
  const showUnassigned = matching([{ name: ui("sensors.unassigned") }], query).length > 0;
  const plants = matching(view.specimens, query);
  const places = matching(view.locations, query);
  return {
    showUnassigned,
    plants,
    places,
    nothing: !showUnassigned && !plants.length && !places.length,
  };
}

/** "Nicht zugeordnet" first, then the sections "Pflanzen" and "Standorte" (Q-108); a section without an entry has no label. */
function PickLists(props: {
  shown: Omit<ReturnType<typeof shownBy>, "nothing">;
  current: string;
  busy: boolean;
  onPick: (choice: Choice) => void;
  listRef: RefObject<HTMLDivElement | null>;
  search: RefObject<HTMLInputElement | null>;
}) {
  const { shown } = props;
  const entry = (value: string, name: string) => (
    <PickEntry
      key={value}
      name={name}
      current={value === props.current}
      busy={props.busy}
      onPick={() => props.onPick({ value, name })}
    />
  );
  return (
    <div
      ref={props.listRef}
      role="group"
      aria-label={ui("sensors.pickList")}
      className="flex min-w-0 flex-col gap-4"
      onKeyDown={(e) => walkEntries(e, props.search)}
    >
      {shown.showUnassigned && <GroupedList>{entry("", ui("sensors.unassigned"))}</GroupedList>}
      {shown.plants.length > 0 && (
        <GroupedList label={ui("sensors.groupPlants")} level={3}>
          {shown.plants.map((x) => entry(`specimen:${x.id}`, x.name))}
        </GroupedList>
      )}
      {shown.places.length > 0 && (
        <GroupedList label={ui("sensors.groupLocations")} level={3}>
          {shown.places.map((x) => entry(`location:${x.id}`, x.name))}
        </GroupedList>
      )}
    </div>
  );
}

/**
 * The search first, then the list (Q-108, SG-SEARCH-01): the search filters from two characters and has a clear control, the
 * arrow down leads into the list. A search without a hit names the query and offers the reset (SG-SEARCH-02); its live region
 * exists before its text, so the line is read when it comes (SG-FEED-04).
 */
export function PickBody(props: {
  view: Places;
  current: string;
  busy: boolean;
  onPick: (choice: Choice) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { nothing, ...shown } = shownBy(props.view, query);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SearchInput
        ref={search}
        aria-label={ui("sensors.searchLabel")}
        placeholder={ui("sensors.searchPlaceholder")}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        onKeyDown={(e) => {
          const first = list.current?.querySelector<HTMLElement>(ENTRY);
          if (e.key !== "ArrowDown" || !first) return;
          e.preventDefault();
          first.focus();
        }}
      />
      <p
        role="status"
        className={cn("break-words text-sm text-muted-foreground", !nothing && "sr-only")}
      >
        {nothing ? ui("sensors.noHit", { query: query.trim() }) : null}
      </p>
      {nothing ? (
        <Button
          type="button"
          variant="tinted"
          className="self-start"
          onClick={() => {
            setQuery("");
            search.current?.focus();
          }}
        >
          {ui("sensors.resetSearch")}
        </Button>
      ) : (
        <PickLists
          shown={shown}
          current={props.current}
          busy={props.busy}
          onPick={props.onPick}
          listRef={list}
          search={search}
        />
      )}
    </div>
  );
}
