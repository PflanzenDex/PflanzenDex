import { useCallback, type ReactNode } from "react";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM } from "@/shared/patterns/responsive/pager/pager";
import { useRequest } from "../../shared/data";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { loadToday } from "../today-api";
import { isTreatment, type TodayDestination } from "./today-row/today-row";
import { NowSkeleton, TodaySkeleton } from "./today-skeleton/today-skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../today.de.json";
import { FurtherTasks, Below, ListState } from "./today-list/today-list";

const t = texts(table);

export type { TodayDestination };

const KEY = ["today", "list"] as const;
const TASKS = "tasks";
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
  /**
   * The counts of the overview are on their way (US-QS-18): the page waits for them with its list and shows its one
   * skeleton until both are there, then its content once (US-QS-14, issue 1697).
   */
  countsPending?: boolean;
}) {
  const { api } = props;
  const load = useCallback((t: string) => loadToday(api, t), [api]);
  const loading = t("page.loading");
  // The one request of the page's lists (the same key, one copy). Until it is there the page shows its skeleton (issue 1697).
  const today = useRequest({ queryKey: KEY, token: props.token, load });
  if (props.countsPending || today.status === "pending") return <TodaySkeleton />;
  const first = today.value?.items[0];
  const treatmentFirst = first !== undefined && isTreatment(first) && !!props.treatmentsEntry;
  return (
    // No min-h-0 here either (issue 1662): the page never shrinks below its content. With min-h-0 the page took the free
    // height and the content past it lay under whatever followed it (the anniversary card then, a tile now).
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h1 id="today-title" className="text-2xl font-semibold">
        {t("page.title")}
      </h1>
      {props.summary?.(treatmentFirst)}
      <section aria-labelledby="now-title" className="flex min-w-0 flex-col gap-2">
        <h2 id="now-title" className="sr-only">
          {t("page.now")}
        </h2>
        <ListState
          today={today}
          loading={loading}
          onOpen={props.onOpen}
          {...(props.treatmentsEntry ? { treatmentsEntry: props.treatmentsEntry } : {})}
        />
      </section>
      {props.tiles?.(treatmentFirst)}
      {today.value && <Below list={today.value} onOpen={props.onOpen} />}
      {/* The former address of the further tasks stays valid: the layer lists the same rows. */}
      <LayerSheet id={TASKS} title={t("tasks.title")}>
        {/* The same request as the page (no second observer, see above). The rows page by the free height of the layer,
            so the pager stays inside the pane (issue 1182). */}
        <RequestState
          status={today.status}
          {...(today.error ? { errorText: today.error.text } : {})}
          onRetry={today.retry}
          offline={today.offline}
          skeleton={<NowSkeleton label={loading} />}
        >
          {today.value ? (
            <FurtherTasks list={today.value} onOpen={props.onOpen} param={LAYER_PARAM} fit />
          ) : null}
        </RequestState>
      </LayerSheet>
    </div>
  );
}
