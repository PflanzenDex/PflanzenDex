import { useCallback, type ReactNode } from "react";
import type { TodayList } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { useIsMd } from "@/lib/use-breakpoint";
import { dateText } from "@/lib/format";
import { LoadFrame, useRequest } from "../../kernel";
import { loadToday } from "../today-api";
import { isTreatment, TodayRow, type TodayDestination } from "./today-row/today-row";

export type { TodayDestination };

const KEY = ["today", "list"] as const;
const TASKS = "tasks";
/**
 * Rows per page of the further tasks below the tiles and in the layer `?sheet=tasks` (starting values, assumption;
 * US-QS-18): three on a phone, so Heute still fits 360×640 px; six from 768 px.
 */
const PAGE_SIZE = { phone: 3, md: 6 } as const;
const laterText = (n: number): string =>
  n === 1
    ? "Ein weiterer Behandlungstermin steht später an."
    : `${n} weitere Behandlungstermine stehen später an.`;

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
  return (
    <>
      {first ? (
        <TodayRow
          item={first}
          date={dateText(list.date)}
          onOpen={props.onOpen}
          {...(isTreatment(first) && props.treatmentsEntry
            ? { action: props.treatmentsEntry }
            : {})}
        />
      ) : (
        <EmptyState
          title="Heute steht nichts an."
          level={3}
          description={
            list.upcoming > 0
              ? laterText(list.upcoming)
              : "Keine Behandlung ist fällig, keine Pflanze steht falsch und keine Angabe fehlt."
          }
          action={{ label: "Zur Sammlung", onClick: () => props.onOpen("collection") }}
        />
      )}
    </>
  );
}

/** The further tasks of the day, treatments excluded: one pager, in the page below the tiles or in the layer. */
function FurtherTasks(props: {
  list: TodayList;
  onOpen: (d: TodayDestination) => void;
  param?: string;
  /** The page takes the free height below the tiles (the page, not the layer). */
  fit?: boolean;
}) {
  const pageSize = useIsMd() ? PAGE_SIZE.md : PAGE_SIZE.phone;
  const rest = props.list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <Pager
      items={rest}
      pageSize={pageSize}
      {...(props.fit ? { fit: true } : {})}
      label="Weitere Aufgaben"
      getKey={(item) => item.id}
      {...(props.param ? { param: props.param } : {})}
      renderItem={(item) => <TodayRow item={item} onOpen={props.onOpen} />}
    />
  );
}

/** What stands below the tiles: the further tasks inline and the later treatments in small text (US-QS-18). */
function Below(props: { list: TodayList; onOpen: (d: TodayDestination) => void }) {
  const { list } = props;
  const [first] = list.items;
  const rest = list.items.slice(1).filter((item) => !isTreatment(item));
  return (
    <>
      {rest.length > 0 && (
        <section
          aria-labelledby="tasks-title"
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
        >
          <h2 id="tasks-title" className="text-sm font-semibold">
            Weitere Aufgaben
          </h2>
          <FurtherTasks list={list} onOpen={props.onOpen} fit />
        </section>
      )}
      {first && list.upcoming > 0 && (
        <p className="text-sm text-muted-foreground">
          {rest.length > 0 ? `${list.upcoming} Termine später` : laterText(list.upcoming)}
        </p>
      )}
    </>
  );
}

/**
 * The central "Today" list (TE-07): what needs action today, most urgent first: treatments overdue or due, plants
 * standing away from their target location, incomplete specimens. Every entry says what to do next and leads to the
 * place where it is done (P-09); an empty list says so, with what is still ahead (P-10). It is the first section,
 * "Jetzt dran", of the destination "Heute"; the app adds the treatments and the missing details below (US-QS-14).
 */
export function TodayPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (d: TodayDestination) => void;
  /**
   * The summary of the open items per category, below the title (US-QS-18); the area knows the other modules. It gets
   * whether the most urgent item is a treatment: then the treatments are named by the entry on its row instead.
   */
  summary?: (treatmentFirst: boolean) => ReactNode;
  /** The tiles of the categories, below "Jetzt dran"; without the treatments tile when the entry stands on the row. */
  tiles?: (treatmentFirst: boolean) => ReactNode;
  /** The one "Behandlungen" entry, shown as the action of a most urgent treatment (US-QS-18). */
  treatmentsEntry?: ReactNode;
}) {
  const { api } = props;
  const load = useCallback((t: string) => loadToday(api, t), [api]);
  const loading = "Heute wird geladen …";
  // The same key as the frame below: one request, one copy. Until it is there the entry stays a tile.
  const today = useRequest({ queryKey: KEY, token: props.token, load });
  const first = today.value?.items[0];
  const treatmentFirst = first !== undefined && isTreatment(first) && !!props.treatmentsEntry;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <h1 id="today-title" className="text-2xl font-semibold">
        Heute
      </h1>
      {props.summary?.(treatmentFirst)}
      <section aria-labelledby="now-title" className="flex min-w-0 flex-col gap-2">
        <h2 id="now-title" className="sr-only">
          Jetzt dran
        </h2>
        <LoadFrame queryKey={KEY} token={props.token} load={load} loadingText={loading}>
          {(list: TodayList) => (
            <Content
              list={list}
              onOpen={props.onOpen}
              {...(props.treatmentsEntry ? { treatmentsEntry: props.treatmentsEntry } : {})}
            />
          )}
        </LoadFrame>
      </section>
      {props.tiles?.(treatmentFirst)}
      {today.value && <Below list={today.value} onOpen={props.onOpen} />}
      {/* The former address of the further tasks stays valid: the layer lists the same rows. */}
      <LayerSheet id={TASKS} title="Weitere Aufgaben">
        <LoadFrame queryKey={KEY} token={props.token} load={load} loadingText={loading}>
          {(list: TodayList) => (
            <FurtherTasks list={list} onOpen={props.onOpen} param={LAYER_PARAM} />
          )}
        </LoadFrame>
      </LayerSheet>
    </div>
  );
}
