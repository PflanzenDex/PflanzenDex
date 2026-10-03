import "./care.css";
import { useCallback, useEffect, useState } from "react";
import type { MeasurementView } from "@pflanzendex/core";
import { LoadError, type ApiError } from "../kernel";
import { MeasureForm } from "./measure-form";
import { MeasurementList } from "./measurement-list";
import { recordMeasurement, loadMeasurementView, type MeasurementInput } from "./measurements-api";
import { MeasurementHeader } from "./measurement-header";
import { measurementText } from "./text";

type Token = () => Promise<string | undefined>;
const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };
type Data =
  { kind: "loading" } | { kind: "error"; error: ApiError } | { kind: "da"; view: MeasurementView };

async function loadData(api: string, token: Token, specimenId: string): Promise<Data> {
  const t = await token();
  if (!t) return { kind: "error", error: SIGN_IN };
  const r = await loadMeasurementView(api, t, specimenId);
  return r.ok ? { kind: "da", view: r.value } : { kind: "error", error: r.error };
}

function useView(api: string, token: Token, specimenId: string, reload: number) {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void loadData(api, token, specimenId).then((d) => current && setData(d));
    return () => {
      current = false;
    };
  }, [api, token, specimenId, reload]);
  return data;
}

/**
 * Measure (US-WAC-01): what to measure, last measurement, last rating, input form and course of a specimen. Rate and
 * trend are still missing (US-WAC-03). Every view says what to do next (P-09).
 */
export function MeasurePage(props: {
  api: string;
  token: Token;
  specimen: { id: string; name: string };
  onBack: () => void;
}) {
  const { api, token, specimen } = props;
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const data = useView(api, token, specimen.id, reload);
  const send = useCallback(
    async (input: MeasurementInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t) return SIGN_IN;
      const r = await recordMeasurement({ api, token: t }, specimen.id, input);
      if (!r.ok) return r.error;
      setSaved(measurementText(r.value));
      setReload((n) => n + 1);
      return null;
    },
    [api, token, specimen.id],
  );
  return (
    <div className="light measure">
      <section aria-labelledby="measure-title">
        <h1 id="measure-title">Messen: {specimen.name}</h1>
        {data.kind === "loading" && <p role="status">Messungen werden geladen …</p>}
        {data.kind === "error" && (
          <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />
        )}
        {data.kind === "da" && (
          <>
            <MeasurementHeader view={data.view} />
            {saved && (
              <p role="status" className="hint">
                Gespeichert: {saved}.
              </p>
            )}
            <MeasureForm unit="cm" onSend={send} />
            <MeasurementList measurements={data.view.measurements} />
          </>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={props.onBack}>
            Zurück zum Bestand
          </button>
        </div>
      </section>
    </div>
  );
}
