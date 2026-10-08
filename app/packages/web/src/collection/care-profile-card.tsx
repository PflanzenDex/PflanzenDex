import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { changesOf, draftOf } from "./care-profile-draft";
import { Days, Dormancy, Hints, Places, type Lists } from "./care-profile-sections";
import { CARD, Quiet } from "./parts";
import { careProfileSchema, type CareProfileFields } from "./schemas";

export type Save = (changes: CareProfileChanges, success: string) => void;

/** The dormancy fields in the order of the form: an incomplete pair is pointed out at the first empty one. */
const DORMANCY_FIELDS = ["fromMonth", "fromDay", "untilMonth", "untilDay"] as const;

/** The care profile of one species: catalog value and my deviation per field (US-BES-09). */
export function CareProfileCard(props: {
  entry: CareProfileEntry;
  lists: Lists;
  busy: boolean;
  onSave: Save;
}) {
  const { entry, busy } = props;
  const initial = draftOf(entry);
  const form = useForm<CareProfileFields>({
    resolver: zodResolver(careProfileSchema),
    defaultValues: initial,
  });
  const draft = useWatch({ control: form.control }) as CareProfileFields;
  const name = entry.speciesName;
  const outcome = changesOf(initial, draft);
  const reset = (changes: CareProfileChanges, label: string) =>
    props.onSave(changes, `„${label}“ für „${name}“ gilt wieder nach Katalog.`);
  const submit = form.handleSubmit((values) => {
    const result = changesOf(initial, values);
    if (result.problem) {
      const first = DORMANCY_FIELDS.find((k) => values[k] === "") ?? "fromMonth";
      form.setError(first, { type: "problem", message: result.problem }, { shouldFocus: true });
    } else if (result.changes) {
      props.onSave(result.changes, `Pflegeprofil für „${name}“ gespeichert.`);
    }
  });
  const shared = { entry, control: form.control, reset, busy };
  return (
    <section className={CARD} aria-labelledby={`profile-${entry.speciesId}`}>
      <h3 id={`profile-${entry.speciesId}`} className="text-xl font-semibold">
        {name}
      </h3>
      <Quiet>
        {`${entry.activeSpecimens} aktive${entry.activeSpecimens === 1 ? "s Exemplar" : " Exemplare"}`}
        {entry.deviates && " · "}
        {entry.deviates && <strong>Meine Abweichung gilt</strong>}
      </Quiet>
      <Form {...form}>
        <FormRoot onSubmit={submit} className="grid gap-1">
          <Places {...shared} lists={props.lists} />
          <Dormancy {...shared} />
          <Days {...shared} />
          <Hints {...shared} />
          <Button
            type="submit"
            size="touch"
            className="mt-3"
            disabled={busy || !(outcome.changes || outcome.problem)}
            aria-label={`Speichern: ${name}`}
          >
            Speichern
          </Button>
        </FormRoot>
      </Form>
    </section>
  );
}
