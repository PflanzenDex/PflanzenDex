import { useState } from "react";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { changesOf, draftOf, type Draft } from "./care-profile-draft";
import { Days, Dormancy, Hints, Places, type Lists } from "./care-profile-sections";

export type Save = (changes: CareProfileChanges, success: string) => void;

/** The care profile of one species: catalog value and my deviation per field (US-BES-09). */
export function CareProfileCard(props: {
  entry: CareProfileEntry;
  lists: Lists;
  busy: boolean;
  onSave: Save;
}) {
  const { entry, busy } = props;
  const initial = draftOf(entry);
  const [draft, setDraft] = useState<Draft>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (d: Partial<Draft>) => {
    setProblem(null);
    setDraft((old) => ({ ...old, ...d }));
  };
  const name = entry.speciesName;
  const outcome = changesOf(initial, draft);
  const reset = (changes: CareProfileChanges, label: string) =>
    props.onSave(changes, `„${label}“ für „${name}“ gilt wieder nach Katalog.`);
  const save = () => {
    setProblem(outcome.problem ?? null);
    if (outcome.changes) props.onSave(outcome.changes, `Pflegeprofil für „${name}“ gespeichert.`);
  };
  const shared = { entry, draft, set, reset, busy };
  return (
    <section className="specimen-card profile-card" aria-labelledby={`profile-${entry.speciesId}`}>
      <h2 id={`profile-${entry.speciesId}`}>{name}</h2>
      <p className="quiet">
        {`${entry.activeSpecimens} aktive${entry.activeSpecimens === 1 ? "s Exemplar" : " Exemplare"}`}
        {entry.deviates && " · "}
        {entry.deviates && <strong>Meine Abweichung gilt</strong>}
      </p>
      <Places {...shared} lists={props.lists} />
      <Dormancy {...shared} />
      <Days {...shared} />
      <Hints {...shared} />
      {problem && (
        <div role="alert" className="warning">
          <p>{problem}</p>
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !(outcome.changes || outcome.problem)}
          aria-label={`Speichern: ${name}`}
          onClick={save}
        >
          Speichern
        </button>
      </div>
    </section>
  );
}
