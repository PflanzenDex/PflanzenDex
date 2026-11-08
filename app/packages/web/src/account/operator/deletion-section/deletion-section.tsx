import { useCallback } from "react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { texts } from "@/shared/lib/text-rules/texts";
import { LoadFrame } from "../../../shared/data";
import { loadDeletions, type DeletionEntry, type DeletionsView } from "../../api/access-api";
import { OperatorRow } from "../operator-parts/operator-parts";
import { OPERATOR_KEY, type Token } from "../operator-page/operator-actions";
import { DeletionLine, IdentityList } from "./deletion-parts/deletion-parts";
import table from "./deletion-section.de.json";

const t = texts(table);

/** The row "Fristen" on the overview: the counts of the card (P-09). */
export function deadlineSummary(view: DeletionsView): string {
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
 * The card "Fristen" (US-ACC-04, issue 1673): the near and passed deadlines, and the identity removals still open. Dates
 * in UTC, the subject and the times only, never an account (P-05). Nothing to do is said in words (P-09).
 */
export function DeletionBody(props: {
  view: DeletionsView;
  running: boolean;
  onMark: (entryId: string) => void;
}) {
  const { view } = props;
  if (view.near.length === 0 && view.past.length === 0 && view.identityRemovals.length === 0)
    return <EmptyState title={t("all.title")} description={t("all.description")} />;
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
      loadingFallback={<p role="status">{t("row.loading")}</p>}
    >
      {(view: DeletionsView) => (
        <DeletionBody view={view} running={props.running} onMark={props.onMark} />
      )}
    </LoadFrame>
  );
}

/** The row "Fristen" on the overview, loaded with the same query as the card. */
export function DeadlineRow(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((sessionToken: string) => loadDeletions(api, sessionToken), [api]);
  return (
    <LoadFrame
      queryKey={[...OPERATOR_KEY, "deletions"]}
      token={token}
      load={load}
      loadingText={t("row.loading")}
      loadingFallback={<OperatorRow id="fristen" title={t("row.title")} value={t("row.loading")} />}
    >
      {(view: DeletionsView) => (
        <OperatorRow id="fristen" title={t("row.title")} value={deadlineSummary(view)} />
      )}
    </LoadFrame>
  );
}
