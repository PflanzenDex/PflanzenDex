import type { KeyScope, WriteSend } from "@/shared/data";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import type { MergeOutcome, ReviewList } from "@pflanzendex/core";
import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/shared/patterns/elements/segmented-control/segmented-control";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { dropPageParts, PAGE_PARAM } from "@/shared/patterns/responsive/pager/paging/address";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { entityKey, useInvalidate, useWriteAction } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { ReviewPageSkeleton } from "./review-page.skeleton";
import { DuplicatesNotice } from "./duplicates-notice/duplicates-notice";
import { refusalText } from "@/shared/lib/error-text";
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

/** The 'Offen' or 'Freigegeben' choice, in the address (`?show=approved`); a changed choice starts at the first entry (US-QS-15). */
function useShow(): [Show, (show: Show) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const show: Show = params.get(SHOW_PARAM) === "approved" ? "approved" : "open";
  const choose = (next: Show) => {
    const address = new URLSearchParams(params);
    if (next === "open") address.delete(SHOW_PARAM);
    else address.set(SHOW_PARAM, next);
    dropPageParts(address, PAGE_PARAM);
    address.delete("sheet");
    setParams(address, { replace: true, state: { ...location.state, keepFocus: true } });
  };
  return [show, choose];
}

/** The three actions of the review list, each one write at a time; a merge also reports what it moved (P-10). */
function useReviewActions(api: string, token: Token, refresh: () => void) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const action = useWriteAction(token, refresh);
  const run = (send: WriteSend, ok: string, scope: KeyScope) => {
    setOutcome(null);
    void action.run(send, ok, scope);
  };
  const actions: ReviewActions = {
    running: action.running,
    onApprove: (caseId) =>
      run(
        (t, opts) => decideProposal(api, t, { caseId, status: "reviewed" }, opts),
        "Vorschlag freigegeben. Die Art ist jetzt für alle sichtbar.",
        entityKey("case", caseId, "reviewed"),
      ),
    onReject: (caseId, reason) =>
      run(
        (t, opts) => decideProposal(api, t, { caseId, status: "rejected", reason }, opts),
        "Vorschlag zurückgewiesen. Der Ersteller sieht deinen Grund.",
        // Set-state with a typed reason (free text): the operation only, the reason is the body (US-QS-03).
        entityKey("case", caseId, "rejected"),
      ),
    onMerge: (caseId, targetSpeciesId) =>
      run(
        async (t, opts) => {
          const r = await mergeProposal(api, t, { caseId, targetSpeciesId }, opts);
          if (r.ok) setOutcome(movedText(r.value as MergeOutcome));
          return r;
        },
        "Vorschlag zusammengeführt.",
        entityKey("case", caseId, `merge:${targetSpeciesId}`),
      ),
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
    <LayerHost className="min-h-0 flex-1" contentClassName="gap-3">
      <SegmentedControl
        label="Welche Vorschläge"
        options={SHOW_OPTIONS}
        value={show}
        onChange={choose}
      />
      {summary && <p className="text-sm">{summary}</p>}
      <DuplicatesNotice duplicates={list.duplicates} />
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
        <ScrollEntries
          items={shown}
          pageSize={size}
          fit
          label={show === "open" ? "Offene Vorschläge" : "Freigegebene Chargen"}
          resetKey={show}
          getKey={(e) => e.reviewCase.id}
          renderItem={(e) => <ReviewRow entry={e} now={now} />}
        />
      )}
      {shown.map((e) => (
        <ReviewLayer key={e.reviewCase.id} entry={e} actions={actions} now={now} />
      ))}
    </LayerHost>
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
    <div data-fit-screen="" data-fit-fill="" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <FullView headingId="review-title" title="Prüfliste">
        {review.message && (
          <p role="status" className="rounded-lg border border-border p-3">
            {review.message} {review.outcome}
          </p>
        )}
        {review.error && (
          <div role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
            <p>{refusalText(review.error)}</p>
            <RefusalClose error={review.error} />
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
      </FullView>
    </div>
  );
}
