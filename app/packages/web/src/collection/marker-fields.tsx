import { specimenName } from "@pflanzendex/core";
import type { SpecimenCard } from "@pflanzendex/core";

/** The active specimens of the chosen species, as far as the form needs them (US-BES-03). */
export type Sibling = Pick<SpecimenCard, "id" | "name" | "marker">;

/** Default marker of the naming rule (DM-BES-03): "clip"; only a preset, freely changeable. */
const DEFAULT_MARKER = "Klammer";

export const MARKERS_MISSING = {
  code: "input.invalid",
  text: "Bitte vergib zuerst alle fehlenden Kennzeichen, bevor du speicherst.",
} as const;
export const MARKER_MISSING = {
  code: "input.invalid",
  text: "Bitte gib ein Kennzeichen an, damit du die Töpfe dieser Art unterscheiden kannst.",
} as const;

/** The rule for the new specimen: the 1st needs no marker, the 2nd and later do, from the 3rd on the others too. */
export function markerRule(siblings: readonly Sibling[]) {
  return {
    required: siblings.length >= 1,
    missing: siblings.length >= 2 ? siblings.filter((s) => s.marker === null) : [],
    preset: siblings.some((s) => s.marker?.toLowerCase() === DEFAULT_MARKER.toLowerCase())
      ? ""
      : DEFAULT_MARKER,
  };
}

/** One labelled marker input; `name` is only set for the marker of the new specimen. */
export function MarkerInput(props: {
  label: string;
  value: string;
  onChange: (marker: string) => void;
  required?: boolean;
  name?: string;
  example?: string;
}) {
  return (
    <label>
      {props.label}
      <input
        {...(props.name ? { name: props.name } : {})}
        value={props.value}
        required={props.required ?? false}
        maxLength={40}
        autoComplete="off"
        placeholder={`zum Beispiel ${props.example ?? "rot"}`}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** Marker of the new specimen plus the markers still missing at existing ones (US-BES-03). */
export function MarkerFields(props: {
  speciesName: string;
  required: boolean;
  missing: readonly Sibling[];
  marker: string;
  onMarker: (marker: string) => void;
  answers: Readonly<Record<string, string>>;
  onAnswer: (id: string, marker: string) => void;
}) {
  return (
    <>
      <MarkerInput
        label={props.required ? "Kennzeichen" : "Kennzeichen (optional)"}
        name="marker"
        value={props.marker}
        required={props.required}
        onChange={props.onMarker}
      />
      <p className="quiet">
        {props.required
          ? "Du hast schon ein Exemplar dieser Art. Das Kennzeichen unterscheidet die Töpfe; „Klammer“ ist nur eine Voreinstellung."
          : "Nur nötig, wenn du schon ein Exemplar dieser Art hast: Dann unterscheidet das Kennzeichen die Töpfe."}
      </p>
      {props.missing.length > 0 && (
        <p className="quiet">
          Ab dem dritten Exemplar braucht jedes Exemplar der Art ein Kennzeichen. Vergib die
          fehlenden jetzt, dann wird alles zusammen gespeichert.
        </p>
      )}
      {props.missing.map((s) => {
        const answer = (props.answers[s.id] ?? "").trim();
        return (
          <div key={s.id}>
            <MarkerInput
              label={`Kennzeichen für „${s.name}“`}
              value={props.answers[s.id] ?? ""}
              required
              example="blau"
              onChange={(k) => props.onAnswer(s.id, k)}
            />
            {answer && (
              <p className="quiet" aria-live="polite">
                „{s.name}“ heißt dann „{specimenName(props.speciesName, answer)}“.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
