import type { MergeOutcome, ReviewList } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { LoadFrame, useWriteAction, type Response } from "../kernel";
import { ReviewEntryView, type ReviewActions } from "./review-entry";
import { decideProposal, loadReviewList, mergeProposal } from "./review-api";
import { movedText, summaryText } from "./review-text";
import "./species.css";

type Token = () => Promise<string | undefined>;

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
  const [refresh, setRefresh] = useState(0);
  const review = useReviewActions(
    api,
    token,
    useCallback(() => setRefresh((n) => n + 1), []),
  );
  const load = useCallback((t: string) => loadReviewList(api, t), [api]);
  const now = (props.now ?? Date.now)();
  return (
    <div className="species review">
      <h1>Prüfliste</h1>
      {review.message && (
        <p role="status" className="hint">
          {review.message} {review.outcome}
        </p>
      )}
      {review.error && (
        <div role="alert" className="warning">
          <p>{review.error.text}</p>
        </div>
      )}
      <LoadFrame token={token} load={load} loadingText="Prüfliste wird geladen …" refresh={refresh}>
        {(list: ReviewList) => (
          <>
            <p className="hint">{summaryText(list, now)}</p>
            <ul className="list" aria-label="Vorschläge">
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
        )}
      </LoadFrame>
    </div>
  );
}
