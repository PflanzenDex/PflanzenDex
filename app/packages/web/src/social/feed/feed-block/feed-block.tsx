import { useCallback, useState } from "react";
import type { Feed, FeedEvent, FeedType } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { keepTogether } from "@/lib/format";
import { texts } from "@/lib/text-rules/texts";
import { LoadFrame } from "../../../kernel";
import { loadFeed, type FeedFilter } from "../../api/feed-api";
import { dateText } from "../../parts/invite-card/invite-card";
import { nameOf } from "../../parts/request-list/request-list";
import table from "../../social.de.json";

const t = texts(table);

/** Events per page until the layout measures the free height of the layer (starting value, assumption; issue 1157). */
const PAGE_SIZE = 3;
const PERIODS = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;

const TYPE_KEY = {
  new_species: "feed.type.newSpecies",
  new_cutting: "feed.type.newCutting",
  new_specimen: "feed.type.newSpecimen",
  potted: "feed.type.potted",
  swapped: "feed.type.swapped",
} as const satisfies Record<FeedType, string>;
const typeText = (type: FeedType) => t(TYPE_KEY[type]);
const speciesText = (e: FeedEvent) =>
  e.speciesGerman && e.speciesLatin
    ? `${e.speciesGerman} (${e.speciesLatin})`
    : (e.speciesGerman ?? e.speciesLatin ?? t("feed.speciesUnknown"));

function Event({ e }: { e: FeedEvent }) {
  return (
    <div className="grid break-words rounded-lg border border-border p-3">
      <span>
        {nameOf(e.friendName)}:{" "}
        {e.count > 1 ? t("feed.plants.other", { count: e.count }) : t("feed.plants.one")}{" "}
        {speciesText(e)}
      </span>
      <span className="text-sm text-muted-foreground">
        {typeText(e.type)} ·{" "}
        {e.date === null ? t("feed.dateUnknown") : dateText(`${e.date}T12:00:00`)}
      </span>
    </div>
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
        <Label htmlFor="feed-friend">{t("feed.friend")}</Label>
        <Select
          id="feed-friend"
          value={value.friendId ?? ""}
          onChange={(e) => onChange({ ...value, friendId: e.target.value || null })}
        >
          <option value="">{t("feed.allFriends")}</option>
          {props.friends.map((f) => (
            <option key={f.id} value={f.id}>
              {nameOf(f.name)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="feed-days">{t("feed.period")}</Label>
        <Select
          id="feed-days"
          value={String(value.days)}
          onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              {keepTogether(t("feed.lastDays", { days: d }))}
            </option>
          ))}
        </Select>
      </div>
      <Checkbox
        checked={value.onlyNewSpecies}
        onChange={(e) => onChange({ ...value, onlyNewSpecies: e.target.checked })}
      >
        {t("feed.onlyNew")}
      </Checkbox>
    </div>
  );
}

/** "Filter (n)" opens the filters in place; n counts the ones that differ from the default (issue 1157). */
function FilterToggle(props: {
  friends: readonly { id: string; name: string | null }[];
  value: FeedFilter;
  onChange: (f: FeedFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls="feed-filters"
        onClick={() => setOpen((v) => !v)}
      >
        {t("feed.filter", { count: activeFilters(props.value) })}
      </Button>
      {open ? (
        <div id="feed-filters">
          <Filters friends={props.friends} value={props.value} onChange={props.onChange} />
        </div>
      ) : null}
    </>
  );
}

/** How many filters differ from the default (all friends, 30 days, every kind). */
const activeFilters = (f: FeedFilter) =>
  (f.friendId === null ? 0 : 1) + (f.days === DEFAULT_DAYS ? 0 : 1) + (f.onlyNewSpecies ? 1 : 0);

/**
 * "Neu bei Freunden" (US-SOZ-05), the content of the layer of that name (US-QS-20): what friends newly collected, newest first, derived from what they share (nothing
 * private ever shows up, P-05). Default period 30 days; filters by friend and "only new species". An unknown date says
 * "Datum unbekannt" (P-08). Every state says what to do next (P-09). No ranking and no comparison between friends.
 * On one screen (US-QS-15, owner decision 2026-11-02, issue 1157): the filters open behind "Filter (n)", the next step
 * and "Stand" are one line, and the events page by the free height of the layer.
 */
export function FeedBlock(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friends: readonly { id: string; name: string | null }[];
}) {
  const [filter, setFilter] = useState<FeedFilter>({
    friendId: null,
    days: DEFAULT_DAYS,
    onlyNewSpecies: false,
  });
  const { api } = props;
  const load = useCallback((tk: string) => loadFeed(api, tk, filter), [api, filter]);
  return (
    <section aria-label={t("feed.title")} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <FilterToggle friends={props.friends} value={filter} onChange={setFilter} />
      <LoadFrame
        queryKey={["social", "feed", filter.friendId, filter.days, filter.onlyNewSpecies]}
        token={props.token}
        load={load}
        loadingText={t("feed.loading")}
      >
        {(feed: Feed) => (
          <>
            <p className="text-sm">
              {feed.hint.text} <strong>{feed.hint.nextAction}</strong>{" "}
              <span className="text-muted-foreground">
                · {t("feed.asOf", { date: dateText(feed.asOf) })}
              </span>
            </p>
            {feed.events.length > 0 && (
              <Pager
                items={feed.events}
                pageSize={PAGE_SIZE}
                fit
                label={t("feed.list")}
                resetKey={`${filter.friendId}-${filter.days}-${filter.onlyNewSpecies}`}
                getKey={(e, i) => `${e.friendId}-${i}`}
                renderItem={(e) => <Event e={e} />}
              />
            )}
          </>
        )}
      </LoadFrame>
    </section>
  );
}
