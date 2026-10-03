import { useState, type FormEvent } from "react";
import { ARCHIVED_REASONS } from "@pflanzendex/core";
import type { ApiError } from "../kernel";

const OTHER = "other";
const REASON_MISSING: ApiError = {
  code: "input.invalid",
  text: "Bitte nenne einen Grund, damit du später noch weißt, warum das Exemplar im Archiv ist.",
};

function ReasonFields(props: {
  choice: string;
  free: string;
  onChoice: (w: string) => void;
  onFree: (f: string) => void;
}) {
  return (
    <>
      <label>
        Grund
        <select value={props.choice} onChange={(e) => props.onChoice(e.target.value)}>
          {ARCHIVED_REASONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={OTHER}>anderer Grund …</option>
        </select>
      </label>
      {props.choice === OTHER && (
        <label>
          Eigener Grund
          <input
            value={props.free}
            maxLength={250}
            autoComplete="off"
            onChange={(e) => props.onFree(e.target.value)}
          />
        </label>
      )}
    </>
  );
}

/**
 * Archive a specimen (US-BES-07): a reason from the list or an own one. The form says beforehand what happens (P-09)
 * and that it can be undone (P-10).
 */
export function ArchiveForm(props: {
  name: string;
  onSend: (reason: string) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<string>(ARCHIVED_REASONS[0]);
  const [free, setFree] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = choice === OTHER ? free.trim() : choice;
    if (!reason) return setError(REASON_MISSING);
    setRunning(true);
    setError(await props.onSend(reason));
    setRunning(false);
  }
  return (
    <section aria-labelledby="archive-title">
      <h1 id="archive-title">Exemplar archivieren</h1>
      <p className="lead">„{props.name}“ verschwindet aus der Liste und aus den Auswertungen.</p>
      <p className="quiet">
        Die Historie bleibt erhalten. Im Archiv kannst du es jederzeit wiederherstellen.
      </p>
      <form className="form" onSubmit={(e) => void send(e)} aria-label="Exemplar archivieren">
        <ReasonFields choice={choice} free={free} onChoice={setChoice} onFree={setFree} />
        {error && (
          <div role="alert" className="warning">
            <p>{error.text}</p>
          </div>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            Archivieren
          </button>
          <button type="button" className="secondary" onClick={props.onCancel}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}
