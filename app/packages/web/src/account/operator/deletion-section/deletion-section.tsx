import { useCallback, type ReactNode } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { useRequest, type Request } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadDeletions, type DeletionEntry, type DeletionsView } from "../../api/access-api";
import { OperatorRow } from "../operator-parts/operator-parts";
import { OPERATOR_KEY, type Token } from "../operator-page/operator-actions";
import { DeletionLine, IdentityList } from "./deletion-parts/deletion-parts";
import table from "./deletion-section.de.json";

const t = texts(table);

/** No deadline near or passed and no identity removal open: the row and the sheet decide it the same way. */
const nothingOpen = (view: DeletionsView): boolean =>
  view.near.length === 0 && view.past.length === 0 && view.identityRemovals.length === 0;

/** The row "Löschfristen" on the overview: the counts of the card (P-09). */
export function deadlineSummary(view: DeletionsView): string {
  if (nothingOpen(view)) return t("row.none");
  return t("row.summary", {
    near: view.near.length,
    past: view.past.length,
    identity: view.identityRemovals.length,
  });
}

/** Near and passed deadlines as plain lists; an empty list says so (P-09). */
function Dates(props: {
  heading: string;
  none: string;
  entries: readonly DeletionEntry[];
  hint?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">{props.heading}</h3>
      {props.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.none}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {props.entries.map((e) => (
            <li
              key={`${e.kind}-${e.entryId ?? e.requestedAt}`}
              className="rounded-lg border border-border p-3"
            >
              <DeletionLine entry={e} />
            </li>
          ))}
        </ul>
      )}
      {props.hint && props.entries.length > 0 && <p className="text-sm">{props.hint}</p>}
    </section>
  );
}

/**
 * The topic "Löschfristen" (US-ACC-04, issue 1673): the near and passed deadlines, and the identity removals still open. Dates
 * in UTC, the subject and the times only, never an account (P-05). Nothing to do is said in words (P-09).
 */
export function DeletionBody(props: {
  view: DeletionsView;
  running: boolean;
  onMark: (entryId: string) => void;
}) {
  const { view } = props;
  if (nothingOpen(view)) return <p className="m-0">{t("all.none")}</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("help", { days: view.warningDays })}</p>
      <Dates heading={t("near.title")} none={t("near.none")} entries={view.near} />
      <Dates
        heading={t("past.title")}
        none={t("past.none")}
        entries={view.past}
        hint={t("past.hint")}
      />
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("identity.title")}</h3>
        <IdentityList
          entries={view.identityRemovals}
          running={props.running}
          onMark={props.onMark}
        />
      </section>
    </div>
  );
}

/** Loads the card; the outcome of a mark arrives through the operator's invalidation (one query key). */
export function DeletionSection(props: {
  api: string;
  token: Token;
  running: boolean;
  onMark: (entryId: string) => void;
}) {
  const { api, token } = props;
  const load = useCallback((sessionToken: string) => loadDeletions(api, sessionToken), [api]);
  return (
    <LoadFrame
      queryKey={[...OPERATOR_KEY, "deletions"]}
      token={token}
      load={load}
      loadingText={t("row.loading")}
      loadingStatus={<p role="status">{t("row.loading")}</p>}
    >
      {(view: DeletionsView) => (
        <DeletionBody view={view} running={props.running} onMark={props.onMark} />
      )}
    </LoadFrame>
  );
}

/** The words of the skeleton, transparent; with `bar` on the skeleton's bars that break like the text. */
function DeadlineWords({ bar }: { bar: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "select-none text-transparent",
        bar &&
          "rounded-control bg-muted [-webkit-box-decoration-break:clone] [box-decoration-break:clone] animate-pulse motion-reduce:animate-none",
      )}
    >
      {t("row.none")}
    </span>
  );
}

/**
 * The value of "Löschfristen" while its counts load (SG-STATE-02, F-0338, issue 2038): the words of the common answer
 * ("Keine Frist offen") transparent, so the row has that line's height from the first frame and shows no number (P-08);
 * after the delay of DS-57 they stand on skeleton bars. The loading text is for assistive technology. The summary of
 * counts above zero is one line too (owner answer 2026-11-16), so the row keeps its height when they arrive.
 */
function DeadlineSkeleton() {
  return (
    <span data-deadline-skeleton="">
      <DelayedSkeleton before={<DeadlineWords bar={false} />}>
        <DeadlineWords bar />
      </DelayedSkeleton>
      <span className="sr-only">{t("row.loading")}</span>
    </span>
  );
}

/**
 * The value of the row "Löschfristen": the counts once they are there, their skeleton while they load (SG-STATE-02); a
 * failure is named in one line, and the layer offers the retry (P-09, P-10).
 */
function deadlineValue(r: Request<DeletionsView>): ReactNode {
  if (r.value !== undefined) return deadlineSummary(r.value);
  if (r.status === "error") return t("row.failed");
  return <DeadlineSkeleton />;
}

/**
 * The row "Löschfristen" on the overview, loaded with the same query as the card. It is one button in every state: only its
 * value waits for the counts, so a press that starts on the row while they load ends on that same row (issue 1722).
 */
export function DeadlineRow(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((sessionToken: string) => loadDeletions(api, sessionToken), [api]);
  const r = useRequest({ queryKey: [...OPERATOR_KEY, "deletions"], token, load });
  return <OperatorRow id="fristen" title={t("row.title")} value={deadlineValue(r)} />;
}
