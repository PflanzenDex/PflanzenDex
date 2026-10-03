import { useState, type FormEvent } from "react";
import type { ApiError } from "../kernel";
import { duplicate, formToInput } from "./form";
import { MoreDetails } from "./more-details";
import { RequiredFields } from "./required-fields";
import { FIELDS } from "./text";

function ErrorBox(props: { error: ApiError; onExisting: (id: string) => void }) {
  const existing = duplicate(props.error);
  const fields = (props.error.details ?? []).map((d) => FIELDS[d.field] ?? d.field);
  return (
    <div role="alert" className="warning">
      <p>{props.error.text}</p>
      {fields.length > 0 && <p>Bitte prüfe: {fields.join(", ")}.</p>}
      {existing && (
        <div className="actions">
          <button type="button" className="secondary" onClick={() => props.onExisting(existing.id)}>
            Vorhandene Art ansehen: {existing.latinName}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Propose species, the path without AI (FR-KI-05): all required fields from DM-BES-01 in the form. The proposal is
 * visible only to the creator and goes into the review list (FR-BES-11); the UI says so beforehand.
 */
export function ProposalForm(props: {
  start?: string;
  onSend: (input: Record<string, unknown>) => Promise<ApiError | null>;
  onCancel: () => void;
  onExisting: (id: string) => void;
}) {
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRunning(true);
    setError(await props.onSend(formToInput(new FormData(e.currentTarget))));
    setRunning(false);
  }
  return (
    <section aria-labelledby="proposal-title">
      <h1 id="proposal-title">Art vorschlagen</h1>
      <p className="hint">
        Dein Vorschlag ist zunächst nur für dich sichtbar und kommt in die Prüfliste. Erst nach der
        Freigabe sehen ihn alle und er zählt im Pokédex. Bis dahin kannst du die Art trotzdem für
        dich wählen.
      </p>
      <p className="quiet">Pflichtfelder sind mit * markiert.</p>
      <form className="form" onSubmit={(e) => void send(e)} aria-label="Art vorschlagen">
        <RequiredFields start={props.start ?? ""} />
        <MoreDetails />
        {error && <ErrorBox error={error} onExisting={props.onExisting} />}
        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            Vorschlag speichern
          </button>
          <button type="button" className="secondary" onClick={props.onCancel}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}
