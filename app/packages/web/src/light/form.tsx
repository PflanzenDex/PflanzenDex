import { useState, type FormEvent } from "react";
import type { ApiError } from "./light-api";

/** Submits a form: reads the fields, waits for the API and keeps the input on an error. */
export function useSend<E>(
  read: (f: FormData) => E,
  save: (e: E) => Promise<ApiError | null>,
  clear: boolean,
) {
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setRunning(true);
    const errorNew = await save(read(new FormData(form)));
    setRunning(false);
    setError(errorNew);
    if (!errorNew && clear) form.reset();
  }
  return { error, running, send };
}

export function FormButtons(props: {
  label: string;
  running: boolean;
  onCancel?: (() => void) | undefined;
}) {
  return (
    <div className="actions">
      <button type="submit" className="primary" disabled={props.running}>
        {props.label}
      </button>
      {props.onCancel && (
        <button type="button" className="secondary" onClick={props.onCancel}>
          Abbrechen
        </button>
      )}
    </div>
  );
}
