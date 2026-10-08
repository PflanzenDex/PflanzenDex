import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import { specimenName } from "@pflanzendex/core";
import type { SpecimenCard } from "@pflanzendex/core";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Quiet } from "./parts";
import type { CreateFields } from "./schemas";

/** The active specimens of the chosen species, as far as the form needs them (US-BES-03). */
export type Sibling = Pick<SpecimenCard, "id" | "name" | "marker">;

/** Default marker of the naming rule (DM-BES-03): "clip"; only a preset, freely changeable. */
const DEFAULT_MARKER = "Klammer";

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
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              required={props.required ?? false}
              maxLength={40}
              autoComplete="off"
              placeholder={`zum Beispiel ${props.example ?? "rot"}`}
            />
          </FormControl>
          {props.description && <FormDescription>{props.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
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
            ? "Du hast schon ein Exemplar dieser Art. Das Kennzeichen unterscheidet die Töpfe; „Klammer“ ist nur eine Voreinstellung."
            : "Nur nötig, wenn du schon ein Exemplar dieser Art hast: Dann unterscheidet das Kennzeichen die Töpfe."
        }
      />
      {props.missing.length > 0 && (
        <Quiet>
          Ab dem dritten Exemplar braucht jedes Exemplar der Art ein Kennzeichen. Vergib die
          fehlenden jetzt, dann wird alles zusammen gespeichert.
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
