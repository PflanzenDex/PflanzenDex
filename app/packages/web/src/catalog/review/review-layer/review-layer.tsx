import type { ReviewEntry } from "@pflanzendex/core";
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { Tabs } from "@/components/data-display/panels/tabs/tabs";
import { Button } from "@/components/ui/button/button";
import { Label } from "@/components/ui/display/label/label";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { caseSheet } from "../review-entry/review-entry";
import { isBatch } from "../review-text";
import { LayerFacts } from "./layer-facts/layer-facts";

export interface ReviewActions {
  running: boolean;
  onApprove: (caseId: string) => void;
  onReject: (caseId: string, reason: string) => void;
  onMerge: (caseId: string, targetSpeciesId: string) => void;
}

/** A decision closes the layer as it is sent; the page then shows what happened (P-10). */
type Done = (act: () => void) => () => void;
type LayerTab = "facts" | "decide";
const TAB_PARAM = "ltab";

/** The tab of the layer is in the address (`?ltab=decide`); the facts are the default (US-QS-15). */
function useLayerTab(): [LayerTab, (tab: LayerTab) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab: LayerTab = params.get(TAB_PARAM) === "decide" ? "decide" : "facts";
  const choose = (next: LayerTab) => {
    const address = new URLSearchParams(params);
    if (next === "facts") address.delete(TAB_PARAM);
    else address.set(TAB_PARAM, next);
    setParams(address, { replace: true, state: location.state });
  };
  return [tab, choose];
}

function Similar(props: { entry: ReviewEntry; actions: ReviewActions; done: Done }) {
  const { entry, actions, done } = props;
  if (entry.similar.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground">
        Mögliche Dublette. Prüfe, ob es dieselbe Pflanze ist.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {entry.similar.map((x) => (
          <li key={x.id} className="flex flex-col gap-1">
            <span className="break-words">
              {x.latinName} (gefunden über „{x.matchedOn}“)
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={actions.running}
              onClick={done(() => actions.onMerge(entry.reviewCase.id, x.id))}
            >
              {`Mit ${x.latinName} zusammenführen`}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rejection with a reason the creator sees; approval is the layer's one filled action. */
function Reject(props: { entry: ReviewEntry; actions: ReviewActions; done: Done }) {
  const { entry, actions, done } = props;
  const [reason, setReason] = useState("");
  const id = entry.reviewCase.id;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`reason-${id}`}>Grund für die Zurückweisung</Label>
      <Textarea
        id={`reason-${id}`}
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={actions.running || reason.trim() === ""}
        onClick={done(() => actions.onReject(id, reason.trim()))}
      >
        Zurückweisen
      </Button>
    </div>
  );
}

/**
 * One case as a layer above the list (US-QS-15): the facts in one tab, the duplicate hint and the decisions in the other;
 * approval is the one filled action and stays at the bottom in both. An operator batch is approved already, so it shows
 * its facts only. The layer scrolls only inside itself.
 */
export function ReviewLayer(props: { entry: ReviewEntry; actions: ReviewActions; now: number }) {
  const { entry, actions, now } = props;
  const id = entry.reviewCase.id;
  const batch = isBatch(entry);
  const blocked = entry.issues.length > 0;
  const { closeLayer } = useLayer(caseSheet(entry));
  const [tab, chooseTab] = useLayerTab();
  const done: Done = (act) => () => {
    closeLayer();
    act();
  };
  const onFacts = batch || tab === "facts";
  const facts = <LayerFacts entry={entry} now={now} />;
  const decide = (
    <div className="flex flex-col gap-4">
      <Similar entry={entry} actions={actions} done={done} />
      <Reject entry={entry} actions={actions} done={done} />
    </div>
  );
  return (
    <LayerSheet
      id={caseSheet(entry)}
      title={entry.species?.latinName ?? "Unbekannte Art"}
      primaryAction={
        batch ? undefined : (
          <Button
            type="button"
            size="touch"
            disabled={actions.running || blocked}
            {...(blocked && onFacts ? { "aria-describedby": `issues-${id}` } : {})}
            onClick={done(() => actions.onApprove(id))}
          >
            Freigeben
          </Button>
        )
      }
    >
      {batch ? (
        facts
      ) : (
        <Tabs
          label="Angaben oder Entscheidung"
          value={tab}
          onValueChange={(value) => chooseTab(value as LayerTab)}
          tabs={[
            { value: "facts", label: "Angaben", content: facts },
            { value: "decide", label: "Entscheiden", content: decide },
          ]}
        />
      )}
    </LayerSheet>
  );
}
