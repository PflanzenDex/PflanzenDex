import { useCallback, type ReactNode } from "react";
import type { TodayItem, TodayKind, TodayList, TodayTarget } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { LayerOpener, LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useIsMd } from "@/lib/use-breakpoint";
import { cn } from "@/lib/utils";
import { dateText, keepTogether, overdueChip, withoutOverdue } from "@/lib/format";
import { LoadFrame } from "../../kernel";
import { loadToday } from "../today-api";

/** Where an action leads: the app wires the destination to a view (the modules do not know each other). */
export type TodayDestination = TodayTarget | "collection";

const KEY = ["today", "list"] as const;
const LABEL: Record<TodayKind, string> = {
  treatment_overdue: "Überfällig",
  treatment_due: "Heute fällig",
  phase_deviation: "Abweichung",
  measurement_etiolated: "Vergeilt",
  specimen_incomplete: "Angaben fehlen",
  buffer_low: "Nachschub",
  equipment_check_due: "Prüfung fällig",
};
const GO: Record<TodayTarget, string> = {
  treatments: "Zu Behandlung",
  care_phases: "Zu Pflegephasen",
  measurements: "Zum Messen",
  hints: "Zu Hinweisen",
  wishlist: "Zur Wunschliste",
  equipment: "Zum Equipment",
};
const CARD =
  "min-w-0 rounded-card bg-card p-3 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]";
const URGENT = "border-warning-border bg-warning text-warning-foreground";
/** Rows per page of the layer with the further tasks (starting values, assumption; US-QS-18): four, six from 768 px. */
const PAGE_SIZE = { phone: 4, md: 6 } as const;
const TASKS = "tasks";

/** The state as a short chip ("10 Tage überfällig"), never a repeated heading and sentence (US-QS-18). */
function chipOf(item: TodayItem): string {
  return (item.kind === "treatment_overdue" ? overdueChip(item.text) : null) ?? LABEL[item.kind];
}

/**
 * One item as a compact row: the state chip, the short text and one action (US-QS-18). The action sentence of the item
 * is not repeated on every row; the action's name says where it leads. `date` is shown only for the most urgent item.
 */
function Row(props: { item: TodayItem; date?: string; onOpen: (d: TodayDestination) => void }) {
  const { item } = props;
  const urgent = item.kind === "treatment_overdue" || item.kind === "treatment_due";
  return (
    <div className={cn(CARD, "flex items-center gap-3", urgent && URGENT)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="w-fit rounded-control border border-current px-2 text-sm font-semibold tabular-nums">
            {chipOf(item)}
          </p>
          {props.date && <p className="text-xs opacity-80">Stand: {props.date}</p>}
        </div>
        <p className="line-clamp-2 text-sm">
          {keepTogether(item.kind === "treatment_overdue" ? withoutOverdue(item.text) : item.text)}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        // An item about the whole account (buffer, US-WUN-02) has no specimen; its text names the zone instead.
        aria-label={`${GO[item.target]}: ${item.specimenName ?? item.text}`}
        onClick={() => props.onOpen(item.target)}
      >
        {GO[item.target]}
      </Button>
    </div>
  );
}

const laterText = (n: number): string =>
  n === 1
    ? "Ein weiterer Behandlungstermin steht später an."
    : `${n} weitere Behandlungstermine stehen später an.`;

/** The single most urgent item; the rest opens as a layer (US-QS-18). */
function Content(props: { list: TodayList; onOpen: (d: TodayDestination) => void }) {
  const { list } = props;
  const pageSize = useIsMd() ? PAGE_SIZE.md : PAGE_SIZE.phone;
  const [first, ...rest] = list.items;
  return (
    <>
      {first ? (
        <Row item={first} date={dateText(list.date)} onOpen={props.onOpen} />
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
      {first && list.upcoming > 0 && rest.length === 0 && (
        <p className="text-sm text-muted-foreground">{laterText(list.upcoming)}</p>
      )}
      {rest.length > 0 && (
        // One row: the further tasks and, small, the treatments that stand later (US-QS-18).
        <LayerOpener id={TASKS} className="h-auto min-h-11 w-full justify-between py-1">
          <span className="flex flex-col items-start text-left">
            <span>Weitere Aufgaben</span>
            {list.upcoming > 0 && (
              <span className="text-xs font-normal">{`${list.upcoming} Termine später`}</span>
            )}
          </span>
          <span className="tabular-nums">{rest.length}</span>
        </LayerOpener>
      )}
      <LayerSheet id={TASKS} title="Weitere Aufgaben">
        <Pager
          items={rest}
          pageSize={pageSize}
          label="Weitere Aufgaben"
          getKey={(item) => item.id}
          renderItem={(item) => <Row item={item} onOpen={props.onOpen} />}
        />
      </LayerSheet>
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
  /** The summary of the open items per category, below the title (US-QS-18); the area knows the other modules. */
  summary?: ReactNode;
  /** The tiles of the categories, below "Jetzt dran" (US-QS-18). */
  tiles?: ReactNode;
}) {
  const { api } = props;
  const load = useCallback((t: string) => loadToday(api, t), [api]);
  const loading = "Heute wird geladen …";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h1 id="today-title" className="text-2xl font-semibold">
        Heute
      </h1>
      {props.summary}
      <section aria-labelledby="now-title" className="flex min-w-0 flex-col gap-2">
        <h2 id="now-title" className="sr-only">
          Jetzt dran
        </h2>
        <LoadFrame queryKey={KEY} token={props.token} load={load} loadingText={loading}>
          {(list: TodayList) => <Content list={list} onOpen={props.onOpen} />}
        </LoadFrame>
      </section>
      {props.tiles}
    </div>
  );
}
