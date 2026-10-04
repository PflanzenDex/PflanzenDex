import type { ReviewEntry } from "@pflanzendex/core";
import { useState } from "react";
import { ageText, issueText } from "./review-text";
import { DIFFICULTY, GROWTH, dormancyPhase, lux, orUnknown } from "./text";

export interface ReviewActions {
  running: boolean;
  onApprove: (caseId: string) => void;
  onReject: (caseId: string, reason: string) => void;
  onMerge: (caseId: string, targetSpeciesId: string) => void;
}

function Facts(props: { entry: ReviewEntry }) {
  const s = props.entry.species;
  if (!s) return <p className="quiet">Der Inhalt dieses Vorschlags ist nicht verfügbar.</p>;
  return (
    <dl className="facts">
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
    <div className="similar">
      <p className="hint">
        Mögliche Dublette: Diese Art gibt es vielleicht schon. Prüfe, ob es dieselbe Pflanze ist.
      </p>
      <ul>
        {entry.similar.map((x) => (
          <li key={x.id}>
            <span>
              {x.latinName} (gefunden über „{x.matchedOn}“)
            </span>
            <button
              type="button"
              disabled={actions.running}
              onClick={() => actions.onMerge(entry.reviewCase.id, x.id)}
            >
              {`Mit ${x.latinName} zusammenführen`}
            </button>
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
    <div className="decision">
      {blocked && (
        <div className="warning" id={`issues-${id}`}>
          <p>Freigabe noch nicht möglich:</p>
          <ul>
            {entry.issues.map((i) => (
              <li key={`${i.field}-${i.reason}`}>{issueText(i)}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="primary"
        disabled={actions.running || blocked}
        {...(blocked ? { "aria-describedby": `issues-${id}` } : {})}
        onClick={() => actions.onApprove(id)}
      >
        Freigeben
      </button>
      <label>
        Grund für die Zurückweisung
        <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={actions.running || reason.trim() === ""}
        onClick={() => actions.onReject(id, reason.trim())}
      >
        Zurückweisen
      </button>
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
    <li className="entry review-entry">
      <h3>{entry.species?.latinName ?? "Unbekannte Art"}</h3>
      <p className="quiet">
        {batch ? "Betreiber-Charge, bereits freigegeben" : "Nutzervorschlag"} · angelegt{" "}
        {ageText(entry.reviewCase.createdAt, now)}
      </p>
      {entry.aiCreated && <p className="badge">KI-erstellt, noch nicht von Menschen geprüft</p>}
      <Facts entry={entry} />
      {!batch && <Similar entry={entry} actions={actions} />}
      {!batch && <Decision entry={entry} actions={actions} />}
    </li>
  );
}
