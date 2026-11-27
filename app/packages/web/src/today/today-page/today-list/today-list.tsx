import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { summaryDate } from "@/shared/lib/format";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { localToday, type TodayList } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { currentTimeZone, type Request } from "../../../shared/data";
import { isTreatment, TodayRow } from "../today-row/today-row";
import type { TodayDestination } from "../../today-destinations";
import { NowSkeleton } from "../today-skeleton/today-skeleton";
import table from "../../today.de.json";

const t = texts(table);
const plural = plurals(table);

/**
 * Rows per page of the further tasks below the tiles and in the layer `?sheet=tasks` (starting values, assumption;
 * US-QS-18): three on a phone, so Heute still fits 360×640 px; six from 768 px.
 */
const PAGE_SIZE = { phone: 3, md: 6 } as const;
/** "Ein weiterer Behandlungstermin …" for one, "{count} weitere …" otherwise, the count with a no-break space (US-QS-32). */
const laterText = (n: number): string => plural.counted("later", n);

/**
 * The single most urgent item and, below the tiles, the further tasks as compact rows (US-QS-18). Treatment items are
 * not listed again: they are counted in the one "Behandlungen" entry (`treatmentsEntry` on the row, or the tile).
 */
function Content(props: {
  list: TodayList;
  onOpen: (d: TodayDestination) => void;
  treatmentsEntry?: ReactNode;
}) {
  const { list } = props;
  const [first] = list.items;
  const today = localToday(new Date(), currentTimeZone());
  // The "Stand" line is left out on the day of the list: it would only repeat "heute" (US-QS-32).
  const stand = list.date === today ? undefined : summaryDate(list.date, today);
  return (
    <>
      {first ? (
        isTreatment(first) && props.treatmentsEntry ? (
          <TodayRow item={first} date={stand} treatmentEntry={props.treatmentsEntry} />
        ) : (
          <GroupedList>
            <TodayRow item={first} date={stand} />
          </GroupedList>
        )
      ) : (
        <EmptyState
          title={t("empty.title")}
          level={3}
          description={list.upcoming > 0 ? laterText(list.upcoming) : t("empty.description")}
          action={{ label: t("empty.action"), onClick: () => props.onOpen("collection") }}
        />
      )}
    </>
  );
}

/** The further tasks of the day, treatments excluded: one list, in the page below the tiles or in the layer. */
export function FurtherTasks(props: {
  list: TodayList;
  /** The page takes the free height below the tiles (the page, not the layer). */
  fit?: boolean;
}) {
  const pageSize = useIsMd() ? PAGE_SIZE.md : PAGE_SIZE.phone;
  const rest = props.list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <ScrollEntries
      items={rest}
      pageSize={pageSize}
      {...(props.fit ? { fit: true } : {})}
      label={t("tasks.title")}
      // The rows do not count towards the height of the section (size containment): the section keeps one row at a larger
      // text size without growing with the entries it shows, so the page size follows the free height only (issue 1113).
      listClassName={props.fit ? `${ROW_GROUP} [contain:size]` : ROW_GROUP}
      getKey={(item) => item.id}
      renderItem={(item) => <TodayRow item={item} bare />}
    />
  );
}

/** What stands below the tiles: the further tasks inline and the later treatments in small text (US-QS-18). */
export function Below(props: { list: TodayList }) {
  const { list } = props;
  const [first] = list.items;
  const rest = list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <>
      {rest.length > 0 && (
        // No min-h-0: when the page has no free height left (200 % text, `main` scrolls), the section keeps one row and
        // the list instead of collapsing to nothing below the next line.
        <section aria-labelledby="tasks-title" className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id="tasks-title" className="text-sm font-semibold">
            {t("tasks.title")}
          </h2>
          <FurtherTasks list={list} fit />
        </section>
      )}
      {first && list.upcoming > 0 && (
        <p className="text-sm text-muted-foreground">
          {rest.length > 0
            ? plural.counted("later.short", list.upcoming)
            : laterText(list.upcoming)}
        </p>
      )}
    </>
  );
}

/**
 * The first section's list in the state of the page's own request. That request is read here and not by a second frame:
 * a second observer would refetch a failed list on every mount, and the page's gate would unmount and remount it in a loop
 * (issue 1697).
 */
export function ListState(props: {
  today: Request<TodayList>;
  loading: string;
  onOpen: (d: TodayDestination) => void;
  treatmentsEntry?: ReactNode;
}) {
  const { today } = props;
  return (
    <RequestState
      status={today.status}
      {...(today.error ? { errorText: today.error.text } : {})}
      onRetry={today.retry}
      offline={today.offline}
      skeleton={<NowSkeleton label={props.loading} />}
    >
      {today.value ? (
        <Content
          list={today.value}
          onOpen={props.onOpen}
          {...(props.treatmentsEntry ? { treatmentsEntry: props.treatmentsEntry } : {})}
        />
      ) : null}
    </RequestState>
  );
}
