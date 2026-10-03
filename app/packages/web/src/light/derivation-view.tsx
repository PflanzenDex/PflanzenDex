import { useState, type FormEvent } from "react";
import type { DerivationRequest, Derivation, Response } from "./light-api";
import { ErrorMessage } from "./message";
import { derivationText } from "./text";

export type Derive = (a: DerivationRequest) => Promise<Response<Derivation>>;

/** US-LIC-01: shows which zone of your account a species is assigned to according to its lux need. */
export function DerivationForm({ onDerive }: { onDerive: Derive }) {
  const [response, setResponse] = useState<Response<Derivation> | null>(null);
  const [running, setRunning] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setRunning(true);
    setResponse(
      await onDerive({
        lightDemandLux: Number(f.get("lightDemandLux")),
        standardLevel: Number(f.get("standardLevel")),
        softLeaf: f.get("softLeaf") === "on",
      }),
    );
    setRunning(false);
  }
  const text = response?.ok ? derivationText(response.value) : null;
  return (
    <form className="form" onSubmit={(e) => void send(e)} aria-label="Zone ermitteln">
      <label>
        Lux-Bedarf der Art (Lux)
        <input
          name="lightDemandLux"
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
          required
        />
      </label>
      <label>
        Standard-Stufe
        <select name="standardLevel" defaultValue="2">
          <option value="2">Stufe 2</option>
          <option value="3">Stufe 3</option>
          <option value="4">Stufe 4</option>
        </select>
      </label>
      <label className="selection">
        <input name="softLeaf" type="checkbox" />
        Sonnenliebende C3-Pflanze mit weichem Blatt
      </label>
      {response && !response.ok && <ErrorMessage error={response.error} />}
      {text && (
        <div role="status" className="result">
          <p>
            <strong>{text.title}</strong>
          </p>
          <p>{text.reason}</p>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={running}>
          Zone ermitteln
        </button>
      </div>
    </form>
  );
}
