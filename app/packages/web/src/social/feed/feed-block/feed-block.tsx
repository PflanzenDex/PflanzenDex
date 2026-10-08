import { useCallback, useState } from "react";
import type { Feed, FeedEvent, FeedType } from "@pflanzendex/core";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { LoadFrame } from "../../../kernel";
import { loadFeed, type FeedFilter } from "../../api/feed-api";
import { dateText } from "../../parts/invite-card/invite-card";
import { nameOf } from "../../parts/request-list/request-list";

const TYPE_TEXT: Record<FeedType, string> = {
  new_species: "Neue Art gefangen",
  new_cutting: "Neuer Steckling",
  new_specimen: "Neues Exemplar",
};
const PERIODS = [7, 30, 90] as const;

const speciesText = (e: FeedEvent) =>
  e.speciesGerman && e.speciesLatin
    ? `${e.speciesGerman} (${e.speciesLatin})`
    : (e.speciesGerman ?? e.speciesLatin ?? "Art unbekannt");

function Event({ e }: { e: FeedEvent }) {
  return (
    <li className="grid break-words rounded-lg border border-border p-3">
      <span>
        {nameOf(e.friendName)}: {e.count > 1 ? `${e.count} Exemplare` : "1 Exemplar"}{" "}
        {speciesText(e)}
      </span>
      <span className="text-sm text-muted-foreground">
        {TYPE_TEXT[e.type]} · {e.date === null ? "Datum unbekannt" : dateText(`${e.date}T12:00:00`)}
      </span>
    </li>
  );
}

function Filters(props: {
  friends: readonly { id: string; name: string | null }[];
  value: FeedFilter;
  onChange: (f: FeedFilter) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="feed-friend">Freund</Label>
        <Select
          id="feed-friend"
          value={value.friendId ?? ""}
          onChange={(e) => onChange({ ...value, friendId: e.target.value || null })}
        >
          <option value="">Alle Freunde</option>
          {props.friends.map((f) => (
            <option key={f.id} value={f.id}>
              {nameOf(f.name)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="feed-days">Zeitraum</Label>
        <Select
          id="feed-days"
          value={String(value.days)}
          onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              Letzte {d} Tage
            </option>
          ))}
        </Select>
      </div>
      <Checkbox
        checked={value.onlyNewSpecies}
        onChange={(e) => onChange({ ...value, onlyNewSpecies: e.target.checked })}
      >
        Nur neue Arten
      </Checkbox>
    </div>
  );
}

/**
 * "Neu bei Freunden" (US-SOZ-05): what friends newly collected, newest first, derived from what they share (nothing
 * private ever shows up, P-05). Default period 30 days; filters by friend and "only new species". An unknown date says
 * "Datum unbekannt" (P-08). Every state says what to do next (P-09). No ranking and no comparison between friends.
 */
export function FeedBlock(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friends: readonly { id: string; name: string | null }[];
}) {
  const [filter, setFilter] = useState<FeedFilter>({
    friendId: null,
    days: 30,
    onlyNewSpecies: false,
  });
  const { api } = props;
  const load = useCallback((t: string) => loadFeed(api, t, filter), [api, filter]);
  return (
    <section aria-labelledby="friend-feed-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-feed-title" className="text-xl font-semibold">
        Neu bei Freunden
      </h2>
      <Filters friends={props.friends} value={filter} onChange={setFilter} />
      <LoadFrame
        queryKey={["social", "feed", filter.friendId, filter.days, filter.onlyNewSpecies]}
        token={props.token}
        load={load}
        loadingText="Neuigkeiten werden geladen …"
      >
        {(feed: Feed) => (
          <>
            <p className="rounded-lg border border-border p-3">
              {feed.hint.text} <strong>{feed.hint.nextAction}</strong>
            </p>
            <p className="text-sm text-muted-foreground">Stand: {dateText(feed.asOf)}</p>
            {feed.events.length > 0 && (
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Neuigkeiten">
                {feed.events.map((e, i) => (
                  <Event key={`${e.friendId}-${i}`} e={e} />
                ))}
              </ul>
            )}
          </>
        )}
      </LoadFrame>
    </section>
  );
}
