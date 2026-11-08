import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import { specimenName } from "@pflanzendex/core";
import { Field } from "@/shared/ui/fields/form/field/field";
import { Input } from "@/shared/ui/fields/input/input";
import { Quiet } from "../../../specimens/cards/parts/parts";
import type { CreateFields } from "../../../specimens/model/schemas";
import type { Sibling } from "../marker-rule";

/** One labelled marker field of a form; the message of a refused marker is linked to it (DS-38). */
export function MarkerInput<T extends FieldValues>(props: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  description?: string;
  example?: string;
}) {
  return (
    <Field
      control={props.control}
      name={props.name}
      label={props.label}
      description={props.description}
    >
      {(field) => (
        <Input
          {...field}
          value={String(field.value ?? "")}
          required={props.required ?? false}
          maxLength={40}
          autoComplete="off"
          placeholder={`zum Beispiel ${props.example ?? "rot"}`}
        />
      )}
    </Field>
  );
}

/** "Bogenhanf" with the marker the keeper typed, as it will be named (DM-BES-03). */
function Answer(props: { control: Control<CreateFields>; sibling: Sibling; speciesName: string }) {
  const answers = useWatch({ control: props.control, name: "answers" });
  const answer = (answers[props.sibling.id] ?? "").trim();
  if (!answer) return null;
  return (
    <Quiet live>
      „{props.sibling.name}“ heißt dann „{specimenName(props.speciesName, answer)}“.
    </Quiet>
  );
}

/** Marker of the new specimen plus the markers still missing at existing ones (US-BES-03). */
export function MarkerFields(props: {
  control: Control<CreateFields>;
  speciesName: string;
  required: boolean;
  missing: readonly Sibling[];
}) {
  return (
    <>
      <MarkerInput
        control={props.control}
        name="marker"
        label={props.required ? "Kennzeichen" : "Kennzeichen (optional)"}
        required={props.required}
        description={
          props.required
            ? "Du hast schon eine Pflanze dieser Art. Das Kennzeichen unterscheidet die Töpfe; „Klammer“ ist nur eine Voreinstellung."
            : "Nur nötig, wenn du schon eine Pflanze dieser Art hast: Dann unterscheidet das Kennzeichen die Töpfe."
        }
      />
      {props.missing.length > 0 && (
        <Quiet>
          Ab der dritten Pflanze braucht jede Pflanze der Art ein Kennzeichen. Vergib die fehlenden
          jetzt, dann wird alles zusammen gespeichert.
        </Quiet>
      )}
      {props.missing.map((s) => (
        <div key={s.id} className="grid gap-1">
          <MarkerInput
            control={props.control}
            name={`answers.${s.id}`}
            label={`Kennzeichen für „${s.name}“`}
            required
            example="blau"
          />
          <Answer control={props.control} sibling={s} speciesName={props.speciesName} />
        </div>
      ))}
    </>
  );
}
