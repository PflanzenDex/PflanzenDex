import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch } from "react-hook-form";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { FormBar } from "@/shared/ui/form-bar";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { changesOf, draftOf } from "../../care-profile-draft";
import type { Lists } from "../care-profile-sections/care-profile-sections";
import { Quiet } from "../../../specimens/cards/parts/parts";
import { careProfileSchema, type CareProfileFields } from "../../../specimens/model/schemas";
import { ProfileFields } from "./profile-fields/profile-fields";

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
  const formId = useId();
  const initial = draftOf(entry);
  const form = useFieldForm<CareProfileFields>({
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
      // `shouldFocus` scrolls the first empty dormancy field into view, so the message is seen (P-10).
      form.setError(first, { type: "problem", message: result.problem }, { shouldFocus: true });
    } else if (result.changes) {
      props.onSave(result.changes, `Pflegeprofil für „${name}“ gesichert.`);
    }
  });
  const shared = { entry, control: form.control, reset, busy };
  return (
    <section className="grid min-w-0 gap-1" aria-labelledby={`profile-${entry.speciesId}`}>
      <h3 id={`profile-${entry.speciesId}`} className="text-xl font-semibold">
        {name}
      </h3>
      <Quiet>
        {`${entry.activeSpecimens} aktive${entry.activeSpecimens === 1 ? " Pflanze" : " Pflanzen"}`}
        {entry.deviates && " · "}
        {entry.deviates && <strong>Meine Abweichung gilt</strong>}
      </Quiet>
      <Form {...form}>
        <FormRoot id={formId} onSubmit={submit} className="grid gap-3">
          <ProfileFields shared={shared} lists={props.lists} name={name} />
          {/* "Abbrechen" and the one save stand after the last field, in the bar of a phone sheet; filled once a value changed (US-QS-32, issue 1969). */}
          <FormBar
            formId={formId}
            confirmName={`Sichern: ${name}`}
            disabled={busy || !(outcome.changes || outcome.problem)}
          >
            Sichern
          </FormBar>
        </FormRoot>
      </Form>
    </section>
  );
}
