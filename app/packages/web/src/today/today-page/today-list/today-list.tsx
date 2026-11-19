import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { summaryDate } from "@/shared/lib/format";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Pager, type PagerPart } from "@/shared/patterns/responsive/pager/pager";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { localToday, type TodayItem, type TodayList } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { currentTimeZone, type Request } from "../../../shared/data";
import { isTreatment, TodayRow } from "../today-row/today-row";
import type { TodayDestination } from "../../today-destinations";
import { NowSkeleton } from "../today-skeleton/today-skeleton";
import table from "../../today.de.json";
import { ListFailure } from "./list-failure/list-failure";

const t = texts(table);
const plural = plurals(table);

/**
 * Rows per page of the further tasks (starting values, assumption; US-QS-18): three on a phone, so Heute still fits 360×640 px;
 * six from 768 px.
 */
const PAGE_SIZE = { phone: 3, md: 6 } as const;
/** "Ein weiterer Behandlungstermin …" for one, "{count} weitere …" otherwise, the count with a no-break space (US-QS-32). */
const laterText = (n: number): string => plural.counted("later", n);

/**
 * The label of the section inside the pager's flat group: 16 px, semibold, with its own padding so it reads as the head of the
 * rows below (SG-TYPE-02, SG-LIST-10). The group keeps its card and hairlines.
 */
const SECTION_LABEL = "px-4 pb-1 pt-3 text-base font-semibold text-foreground";

/** One entry of the further tasks: the label of the section that needs action today, or a task row. */
type Entry = { kind: "section" } | { kind: "row"; item: TodayItem };

/**
 * The entries of the further tasks (SG-LIST-10): the items that need action today stand under "Heute"; the label is an entry
 * of the group only when there are rows. The treatments are not listed here (US-QS-18).
 */
function entriesOf(rest: readonly TodayItem[]): Entry[] {
  if (rest.length === 0) return [];
  return [{ kind: "section" }, ...rest.map((item): Entry => ({ kind: "row", item }))];
}

const entryKey = (entry: Entry, index: number): string =>
  entry.kind === "section" ? "section:today" : `${index}:${entry.item.id}`;

/** One entry rendered: the label, or a task row (a GroupedRow with its target). */
function EntryView(props: { entry: Entry; level: 2 | 3 }) {
  const { entry } = props;
  if (entry.kind === "section") {
    const Heading = props.level === 3 ? "h3" : "h2";
    return <Heading className={SECTION_LABEL}>{t("sections.today")}</Heading>;
  }
  return <TodayRow item={entry.item} bare />;
}

/**
 * The further tasks of the day, treatments excluded: one fitted pager, in the page below the tiles or in the layer
 * `?sheet=tasks`. The section label and the rows form one flat group (SG-SHAPE-03, SG-LIST-10).
 */
export function FurtherTasks(props: {
  list: TodayList;
  param?: PagerPart;
  /** The page takes the free height below the tiles (the page, not the layer). */
  fit?: boolean;
}) {
  const pageSize = useIsMd() ? PAGE_SIZE.md : PAGE_SIZE.phone;
  const rest = props.list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <Pager
      items={entriesOf(rest)}
      pageSize={pageSize}
      {...(props.fit ? { fit: true } : {})}
      label={t("tasks.title")}
      // The rows do not count towards the height of the section (size containment): the section keeps one row and the
      // pager at a larger text size without growing with the page it shows, so the page size follows the free height
      // only (issue 1113).
      listClassName={props.fit ? `${ROW_GROUP} [contain:size]` : ROW_GROUP}
      getKey={entryKey}
      {...(props.param ? { param: props.param } : {})}
      renderItem={(entry) => <EntryView entry={entry} level={3} />}
    />
  );
}

/** What stands below the tiles: the further tasks in their section and the later treatments in small text (US-QS-18). */
export function Below(props: { list: TodayList }) {
  const { list } = props;
  const [first] = list.items;
  const rest = list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <>
      {rest.length > 0 && (
        // No min-h-0: when the page has no free height left (200 % text, `main` scrolls), the section keeps one row and the
        // pager instead of collapsing to nothing below the next line.
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
 * The most urgent item of the day, in the state of the page's own request. That request is read here and not by a second frame:
 * a second observer would refetch a failed list on every mount (issue 1697).
 */
export function ListState(props: {
  today: Request<TodayList>;
  loading: string;
  onOpen: (d: TodayDestination) => void;
  treatmentsEntry?: ReactNode;
}) {
  const { today } = props;
  if (today.status === "error")
    return <ListFailure text={today.error?.text} onRetry={today.retry} />;
  return (
    <RequestState
      status={today.status}
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

/** The single most urgent item; a treatment carries the one "Behandlungen" row of its count (US-QS-18). */
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
