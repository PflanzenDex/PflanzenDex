import type { Occasion, ReminderOccasion, ReminderRow, ReminderStatus } from "@pflanzendex/core";
import { useCallback } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import {
  EXCHANGE_PATH,
  PATHS,
  PHASES_ADDRESS,
  todayAddress,
} from "@/shared/patterns/navigation/navigation/navigation";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadInbox } from "../api/reminders-api";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../monitoring.de.json";
import { InboxSkeleton } from "./inbox.skeleton";

const ui = texts(table);

const STATUS_TEXT: Record<
  ReminderStatus,
  "status.none" | "status.pending" | "status.inApp" | "status.delivered" | "status.failed"
> = {
  none: "status.none",
  pending: "status.pending",
  in_app: "status.inApp",
  delivered: "status.delivered",
  failed: "status.failed",
};

/**
 * Where the step of each occasion is done (US-QS-32): the Heute list of its topic, or the place of its phase, its devices
 * and its plants. A treatment opens the treatments of "Heute", where the appointment is ticked off.
 */
const OPENS: Record<ReminderOccasion, string> = {
  treatment: todayAddress("treatments"),
  watering: todayAddress("watering"),
  phase: PHASES_ADDRESS,
  measurement: `${PATHS.collection}?view=plants`,
  equipment: `${PATHS.collection}?view=equipment`,
  swap: EXCHANGE_PATH,
  friends: PATHS.friends,
};

/** Days per page inside the layer (starting value, assumption; US-QS-15). */
const PAGE = 2;

/** A local calendar date `YYYY-MM-DD` as text; read as UTC so the zone of the device never shifts the day (NFR-08). */
const dayText = (localDate: string) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );

/**
 * One day of the inbox (US-QS-32): its entries are one flat group of rows, each row the entry's text and the link to where
 * its step is done. The step is said once under the group, not under every entry.
 */
/** The entries of one day grouped by occasion, in the order each occasion first appears (US-QS-32). */
function byOccasion(items: readonly Occasion[]): Occasion[][] {
  const groups = new Map<ReminderOccasion, Occasion[]>();
  for (const item of items) groups.set(item.occasion, [...(groups.get(item.occasion) ?? []), item]);
  return [...groups.values()];
}

/** The distinct steps of a group, each once: identical entries say their step once, different steps are all kept (P-09). */
const stepsOf = (group: readonly Occasion[]) => [...new Set(group.map((item) => item.nextAction))];

/**
 * One day of the inbox (US-QS-32): its entries are grouped by occasion, one flat group of rows per occasion. Each row is the
 * entry's text and the link to where its step is done; the group names its step once, as its footer.
 */
function Reminder({ row }: { row: ReminderRow }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 text-base font-semibold">{dayText(row.localDate)}</h4>
        <span className="text-sm text-muted-foreground">{ui(STATUS_TEXT[row.status])}</span>
      </div>
      {byOccasion(row.items).map((group) => (
        <GroupedList
          key={group[0]?.occasion}
          footer={stepsOf(group).map((step) => (
            <span key={step} className="block">
              {step}
            </span>
          ))}
        >
          {group.map((item) => (
            <GroupedRow key={item.id} to={OPENS[item.occasion]} title={item.text} />
          ))}
        </GroupedList>
      ))}
      {row.status === "failed" && <p className="m-0 text-sm">{ui("inbox.failed")}</p>}
    </section>
  );
}

/**
 * The inbox of reminders (US-MON-01): the bundled message of each day on which something needed action, newest first,
 * in pages of whole days (US-QS-15). Without a push channel this is where a reminder lives; a failed delivery stays
 * visible (P-10) and says where to go on (P-09).
 */
export function Inbox(props: { api: string; token: () => Promise<string | undefined> }) {
  const load = useCallback((t: string) => loadInbox(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={["monitoring", "inbox"]}
      token={props.token}
      load={load}
      loadingText={ui("inbox.loading")}
      loadingFallback={<InboxSkeleton label={ui("inbox.loading")} />}
    >
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState
            level={3}
            title={ui("inbox.none.title")}
            description={ui("inbox.none.description")}
          />
        ) : (
          <ScrollEntries
            items={rows}
            pageSize={PAGE}
            label={ui("inbox.label")}
            getKey={(row) => row.id}
            renderItem={(row) => <Reminder row={row} />}
          />
        )
      }
    </LoadFrame>
  );
}
