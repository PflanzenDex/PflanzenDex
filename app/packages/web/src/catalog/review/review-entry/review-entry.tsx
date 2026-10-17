import type { ReviewEntry } from "@pflanzendex/core";
import { useState } from "react";
import { Badge } from "@/components/ui/display/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Label } from "@/components/ui/display/label/label";
import { Textarea } from "@/components/ui/fields/textarea/textarea";
import { ageText, issueText } from "../review-text";
import { DIFFICULTY, GROWTH, dormancyPhase, lux, orUnknown } from "../../shared/text";

export interface ReviewActions {
  running: boolean;
  onApprove: (caseId: string) => void;
  onReject: (caseId: string, reason: string) => void;
  onMerge: (caseId: string, targetSpeciesId: string) => void;
}

function Facts(props: { entry: ReviewEntry }) {
  const s = props.entry.species;
  if (!s)
    return (
      <p className="text-sm text-muted-foreground">
        Der Inhalt dieses Vorschlags ist nicht verfügbar.
      </p>
    );
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr] [&>dd]:m-0 [&>dd]:break-words [&>dt]:text-muted-foreground">
      <dt>Schwierigkeit</dt>
      <dd>{DIFFICULTY[s.difficulty] ?? "unbekannt"}</dd>
      <dt>Standard-Stufe</dt>
      <dd>{s.standardLevel}</dd>
      <dt>Lichtbedarf</dt>
      <dd>{lux(s.lightDemandLux)}</dd>
      <dt>Ruhephase</dt>
      <dd>{dormancyPhase(s)}</dd>
      <dt>Wachstumsmaß</dt>
      <dd>{GROWTH[s.growthMeasure]}</dd>
      <dt>Vergeilungsanzeichen</dt>
      <dd>{s.etiolationSigns}</dd>
      <dt>Erfolgskriterien</dt>
      <dd>{s.successCriteria}</dd>
      <dt>Quelle</dt>
      <dd>{orUnknown(s.source)}</dd>
    </dl>
  );
}

function Similar(props: { entry: ReviewEntry; actions: ReviewActions }) {
  const { entry, actions } = props;
  if (entry.similar.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground">
        Mögliche Dublette: Diese Art gibt es vielleicht schon. Prüfe, ob es dieselbe Pflanze ist.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {entry.similar.map((x) => (
          <li key={x.id} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <span className="min-w-0 break-words">
              {x.latinName} (gefunden über „{x.matchedOn}“)
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={actions.running}
              onClick={() => actions.onMerge(entry.reviewCase.id, x.id)}
            >
              {`Mit ${x.latinName} zusammenführen`}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Decision(props: { entry: ReviewEntry; actions: ReviewActions }) {
  const { entry, actions } = props;
  const [reason, setReason] = useState("");
  const id = entry.reviewCase.id;
  const blocked = entry.issues.length > 0;
  return (
    <div className="flex flex-col gap-3">
      {blocked && (
        <div
          id={`issues-${id}`}
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          <p>Freigabe noch nicht möglich:</p>
          <ul className="m-0 pl-5">
            {entry.issues.map((i) => (
              <li key={`${i.field}-${i.reason}`}>{issueText(i)}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        type="button"
        size="touch"
        className="sm:self-start"
        disabled={actions.running || blocked}
        {...(blocked ? { "aria-describedby": `issues-${id}` } : {})}
        onClick={() => actions.onApprove(id)}
      >
        Freigeben
      </Button>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`reason-${id}`}>Grund für die Zurückweisung</Label>
        <Textarea
          id={`reason-${id}`}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="sm:self-start"
        disabled={actions.running || reason.trim() === ""}
        onClick={() => actions.onReject(id, reason.trim())}
      >
        Zurückweisen
      </Button>
    </div>
  );
}

/** One proposal or operator batch of the review list (US-BES-10). */
export function ReviewEntryView(props: {
  entry: ReviewEntry;
  actions: ReviewActions;
  now: number;
}) {
  const { entry, actions, now } = props;
  const batch = entry.reviewCase.status === "curated";
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h2 className="break-words text-lg font-semibold">
        {entry.species?.latinName ?? "Unbekannte Art"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {batch ? "Betreiber-Charge, bereits freigegeben" : "Nutzervorschlag"} · angelegt{" "}
        {ageText(entry.reviewCase.createdAt, now)}
      </p>
      {entry.aiCreated && (
        <Badge variant="warning" className="self-start whitespace-normal">
          KI-erstellt, noch nicht von Menschen geprüft
        </Badge>
      )}
      <Facts entry={entry} />
      {!batch && <Similar entry={entry} actions={actions} />}
      {!batch && <Decision entry={entry} actions={actions} />}
    </li>
  );
}
