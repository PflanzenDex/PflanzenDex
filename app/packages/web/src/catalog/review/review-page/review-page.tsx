import type { MergeOutcome, ReviewList } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/segmented-control/segmented-control";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import { LoadFrame, useInvalidate, useWriteAction, type Response } from "../../../kernel";
import { ReviewPageSkeleton } from "./review-page.skeleton";
import { refusalText } from "../../shared/refusal";
import { ReviewRow } from "../review-entry/review-entry";
import { ReviewLayer, type ReviewActions } from "../review-layer/review-layer";
import { decideProposal, loadReviewList, mergeProposal } from "../review-api";
import { isBatch, movedText, summaryText } from "../review-text";

type Token = () => Promise<string | undefined>;
type Show = "open" | "approved";
const KEY = ["catalog", "review"] as const;
const SHOW_PARAM = "show";
const SHOW_OPTIONS: readonly SegmentedOption<Show>[] = [
  { value: "open", label: "Offen" },
  { value: "approved", label: "Freigegeben" },
];

/** The 'Offen' or 'Freigegeben' choice, in the address (`?show=approved`); a changed choice starts at page 1 (US-QS-15). */
function useShow(): [Show, (show: Show) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const show: Show = params.get(SHOW_PARAM) === "approved" ? "approved" : "open";
  const choose = (next: Show) => {
    const address = new URLSearchParams(params);
    if (next === "open") address.delete(SHOW_PARAM);
    else address.set(SHOW_PARAM, next);
    address.delete("page");
    address.delete("sheet");
    setParams(address, { replace: true, state: location.state });
  };
  return [show, choose];
}

/** The three actions of the review list, each one write at a time; a merge also reports what it moved (P-10). */
function useReviewActions(api: string, token: Token, refresh: () => void) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const action = useWriteAction(token, refresh);
  const run = (send: (t: string) => Promise<Response<unknown>>, ok: string) => {
    setOutcome(null);
    void action.run(send, ok);
  };
  const actions: ReviewActions = {
    running: action.running,
    onApprove: (caseId) =>
      run(
        (t) => decideProposal(api, t, { caseId, status: "reviewed" }),
        "Vorschlag freigegeben. Die Art ist jetzt für alle sichtbar.",
      ),
    onReject: (caseId, reason) =>
      run(
        (t) => decideProposal(api, t, { caseId, status: "rejected", reason }),
        "Vorschlag zurückgewiesen. Der Ersteller sieht deinen Grund.",
      ),
    onMerge: (caseId, targetSpeciesId) =>
      run(async (t) => {
        const r = await mergeProposal(api, t, { caseId, targetSpeciesId });
        if (r.ok) setOutcome(movedText(r.value as MergeOutcome));
        return r;
      }, "Vorschlag zusammengeführt."),
  };
  return { actions, message: action.message, outcome, error: action.error };
}

/** The list of one choice, paged in whole rows, with the layers of its cases beside it (US-QS-15, US-BES-10). */
function ReviewBody(props: {
  list: ReviewList;
  show: Show;
  choose: (show: Show) => void;
  actions: ReviewActions;
  now: number;
  reload: () => void;
}) {
  const { list, show, choose, actions, now, reload } = props;
  // Eight rows from 1024 px: ten batch rows do not fit a 900 px screen beside the title (starting values, US-QS-22).
  const size = Math.min(useRowPageSize(), 8);
  const shown = list.entries.filter((e) => isBatch(e) === (show === "approved"));
  const summary = show === "open" ? summaryText(list, now) : "";
  return (
    <div className="flex min-w-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <SegmentedControl
          label="Welche Vorschläge"
          options={SHOW_OPTIONS}
          value={show}
          onChange={choose}
        />
        {summary && <p className="text-sm">{summary}</p>}
        {shown.length === 0 ? (
          show === "open" ? (
            <EmptyState
              title="Keine offenen Vorschläge"
              description="Es ist nichts zu prüfen."
              action={{ label: "Liste neu laden", onClick: reload }}
            />
          ) : (
            <EmptyState
              title="Noch keine freigegebenen Chargen"
              description="Betreiber-Chargen erscheinen hier, sobald sie freigegeben sind."
              action={{ label: "Offene Vorschläge ansehen", onClick: () => choose("open") }}
            />
          )
        ) : (
          <Pager
            items={shown}
            pageSize={size}
            label={show === "open" ? "Offene Vorschläge" : "Freigegebene Chargen"}
            resetKey={show}
            getKey={(e) => e.reviewCase.id}
            renderItem={(e) => <ReviewRow entry={e} now={now} />}
          />
        )}
      </div>
      {shown.map((e) => (
        <ReviewLayer key={e.reviewCase.id} entry={e} actions={actions} now={now} />
      ))}
    </div>
  );
}

/** The review list for operators and reviewers (US-BES-10): open cases first, approved batches behind their choice. */
export function ReviewPage(props: { api: string; token: Token; now?: () => number }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const review = useReviewActions(api, token, reload);
  const [show, choose] = useShow();
  const load = useCallback((t: string) => loadReviewList(api, t), [api]);
  const now = (props.now ?? Date.now)();
  return (
    <div
      data-fit-screen=""
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7"
    >
      <h1 className="text-2xl font-semibold">Prüfliste</h1>
      {review.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {review.message} {review.outcome}
        </p>
      )}
      {review.error && (
        <div role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          <p>{refusalText(review.error)}</p>
        </div>
      )}
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText="Prüfliste wird geladen …"
        loadingFallback={<ReviewPageSkeleton label="Prüfliste wird geladen …" />}
      >
        {(list: ReviewList) => (
          <ReviewBody
            list={list}
            show={show}
            choose={choose}
            actions={review.actions}
            now={now}
            reload={reload}
          />
        )}
      </LoadFrame>
    </div>
  );
}
