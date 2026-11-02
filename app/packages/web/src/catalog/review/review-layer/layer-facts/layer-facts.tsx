import type { ReviewEntry } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { ageText, issueText } from "../../review-text";
import {
  growthText,
  difficultyText,
  dormancyPhase,
  levelText,
  lux,
  orUnknown,
} from "../../../shared/text";

function Facts(props: { entry: ReviewEntry }) {
  const s = props.entry.species;
  if (!s)
    return (
      <p className="text-sm text-muted-foreground">
        Der Inhalt dieses Vorschlags ist nicht verfügbar.
      </p>
    );
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 [&>dd]:m-0 [&>dd]:break-words [&>dt]:text-muted-foreground">
      <dt>Schwierigkeit</dt>
      <dd>{difficultyText(s.difficulty)}</dd>
      <dt>Standard-Stufe</dt>
      <dd>{levelText(s.standardLevel)}</dd>
      <dt>Lichtbedarf</dt>
      <dd>{lux(s.lightDemandLux)}</dd>
      <dt>Ruhephase</dt>
      <dd>{dormancyPhase(s)}</dd>
      <dt>Wachstumsmaß</dt>
      <dd>{growthText(s.growthMeasure)}</dd>
      <dt>Vergeilungsanzeichen</dt>
      <dd>{orUnknown(s.etiolationSigns)}</dd>
      <dt>Erfolgskriterien</dt>
      <dd>{orUnknown(s.successCriteria)}</dd>
      <dt>Quelle</dt>
      <dd>{orUnknown(s.source)}</dd>
    </dl>
  );
}

/**
 * The facts tab of a case (US-BES-10): the age, the AI marking, the fields in two columns, and why approval is not
 * possible yet. An operator batch has no missing fields to show.
 */
export function LayerFacts(props: { entry: ReviewEntry; now: number }) {
  const { entry, now } = props;
  const batch = entry.reviewCase.status === "curated";
  const blocked = entry.issues.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {batch ? "Betreiber-Charge, bereits freigegeben" : "Nutzervorschlag"} ·{" "}
        {ageText(entry.reviewCase.createdAt, now)}
      </p>
      {entry.aiCreated && (
        <Badge variant="warning" className="self-start whitespace-normal">
          KI-erstellt, noch nicht geprüft
        </Badge>
      )}
      <Facts entry={entry} />
      {!batch && blocked && (
        <div
          id={`issues-${entry.reviewCase.id}`}
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          <p>Freigabe noch nicht möglich: {entry.issues.map(issueText).join("; ")}.</p>
        </div>
      )}
    </div>
  );
}
