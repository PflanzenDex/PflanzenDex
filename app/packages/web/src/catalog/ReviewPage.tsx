import type { MergeOutcome, ReviewList } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadFrame, useInvalidate, useWriteAction, type Response } from "../kernel";
import { ReviewPageSkeleton } from "./ReviewPage.skeleton";
import { refusalText } from "./refusal";
import { ReviewEntryView, type ReviewActions } from "./review-entry";
import { decideProposal, loadReviewList, mergeProposal } from "./review-api";
import { movedText, summaryText } from "./review-text";

type Token = () => Promise<string | undefined>;
const KEY = ["catalog", "review"] as const;

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

/** The review list for operators and reviewers (US-BES-10): approve, reject with a reason, merge with a species. */
export function ReviewPage(props: { api: string; token: Token; now?: () => number }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const review = useReviewActions(api, token, reload);
  const load = useCallback((t: string) => loadReviewList(api, t), [api]);
  const now = (props.now ?? Date.now)();
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
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
        {(list: ReviewList) =>
          list.entries.length === 0 ? (
            <EmptyState
              title="Keine offenen Vorschläge"
              description="Es ist nichts zu prüfen."
              action={{ label: "Liste neu laden", onClick: reload }}
            />
          ) : (
            <>
              <p className="rounded-lg border border-border p-3">{summaryText(list, now)}</p>
              <ul className="m-0 grid list-none gap-3 p-0" aria-label="Vorschläge">
                {list.entries.map((entry) => (
                  <ReviewEntryView
                    key={entry.reviewCase.id}
                    entry={entry}
                    actions={review.actions}
                    now={now}
                  />
                ))}
              </ul>
            </>
          )
        }
      </LoadFrame>
    </div>
  );
}
