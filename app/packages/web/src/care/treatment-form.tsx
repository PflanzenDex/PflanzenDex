import { useState, type FormEvent } from "react";
import { localToday, TREATMENT_LIMITS } from "@pflanzendex/core";
import { currentTimeZone } from "../kernel";
import { checkTreatment, COURSE_START, type TreatmentFields } from "./treatment-input";
import type { TreatableSpecimen, TreatmentInput } from "./treatments-api";

function SpecimenChoice(props: {
  specimens: readonly TreatableSpecimen[];
  chosen: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="choice">
      <legend>Exemplare</legend>
      {props.specimens.map((z) => (
        <label key={z.id} className="check">
          <input
            type="checkbox"
            checked={props.chosen.includes(z.id)}
            onChange={() => props.onToggle(z.id)}
          />
          {z.name}
        </label>
      ))}
    </fieldset>
  );
}

function BasicFields(props: {
  fields: TreatmentFields;
  set: (change: Partial<TreatmentFields>) => void;
}) {
  const { fields, set } = props;
  return (
    <>
      <label>
        Grund
        <input
          autoComplete="off"
          maxLength={TREATMENT_LIMITS.reason.max}
          placeholder="zum Beispiel Wollläuse"
          value={fields.reason}
          onChange={(e) => set({ reason: e.target.value })}
        />
      </label>
      <label>
        Mittel (optional)
        <input
          autoComplete="off"
          maxLength={TREATMENT_LIMITS.agent.max}
          value={fields.agent}
          onChange={(e) => set({ agent: e.target.value })}
        />
      </label>
      <label>
        Datum
        <input type="date" value={fields.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
    </>
  );
}

function CourseFields(props: {
  fields: TreatmentFields;
  set: (change: Partial<TreatmentFields>) => void;
}) {
  const { fields, set } = props;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={fields.isCourse}
          onChange={(e) => set({ isCourse: e.target.checked })}
        />
        Kur planen (mehrere Termine)
      </label>
      {fields.isCourse && (
        <div className="pair">
          <label>
            Anzahl der Termine
            <input
              inputMode="numeric"
              autoComplete="off"
              value={fields.count}
              onChange={(e) => set({ count: e.target.value })}
            />
          </label>
          <label>
            Abstand in Tagen
            <input
              inputMode="numeric"
              autoComplete="off"
              value={fields.intervalDays}
              onChange={(e) => set({ intervalDays: e.target.value })}
            />
          </label>
        </div>
      )}
    </>
  );
}

/**
 * Form "Behandlung planen" (US-BEH-01): one or several specimens, a reason, an optional agent and the (first) date;
 * with "Kur planen" N dates at T days (default 3 at 7). The date starts at today according to the device's local date
 * (NFR-08). A refusal stays visible and keeps the input (P-10).
 */
export function TreatmentForm(props: {
  specimens: readonly TreatableSpecimen[];
  running: boolean;
  onSend: (input: TreatmentInput) => Promise<boolean>;
}) {
  const today = localToday(new Date(), currentTimeZone());
  const [fields, setFields] = useState<TreatmentFields>({
    specimenIds: [],
    reason: "",
    agent: "",
    date: today,
    isCourse: false,
    ...COURSE_START,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<TreatmentFields>) => setFields((f) => ({ ...f, ...change }));
  const toggle = (id: string) =>
    set({
      specimenIds: fields.specimenIds.includes(id)
        ? fields.specimenIds.filter((x) => x !== id)
        : [...fields.specimenIds, id],
    });
  async function send(e: FormEvent) {
    e.preventDefault();
    const reviewed = checkTreatment(fields);
    if (!reviewed.ok) return setProblem(reviewed.text);
    setProblem(null);
    if (await props.onSend(reviewed.input)) set({ specimenIds: [], reason: "", agent: "" });
  }
  return (
    <form className="form" onSubmit={(e) => void send(e)} aria-label="Behandlung planen" noValidate>
      <SpecimenChoice specimens={props.specimens} chosen={fields.specimenIds} onToggle={toggle} />
      <BasicFields fields={fields} set={set} />
      <CourseFields fields={fields} set={set} />
      {problem && (
        <div role="alert" className="warning">
          <p>{problem}</p>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={props.running}>
          {fields.isCourse ? "Kur planen" : "Behandlung speichern"}
        </button>
      </div>
    </form>
  );
}
