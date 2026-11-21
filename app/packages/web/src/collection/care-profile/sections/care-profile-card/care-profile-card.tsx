import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch } from "react-hook-form";
import { useLocation, useSearchParams } from "react-router";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { FormBar } from "@/shared/ui/button/form-bar/form-bar";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/fields/form/form";
import { dropPageParts, LAYER_PARAM } from "@/shared/patterns/responsive/pager/pager";
import { changesOf, draftOf } from "../../care-profile-draft";
import type { Lists } from "../care-profile-sections/care-profile-sections";
import { Quiet } from "../../../specimens/cards/parts/parts";
import { careProfileSchema, type CareProfileFields } from "../../../specimens/model/schemas";
import { ProfileFields } from "./profile-fields/profile-fields";

export type Save = (changes: CareProfileChanges, success: string) => void;

/** The dormancy fields in the order of the form: an incomplete pair is pointed out at the first empty one. */
const DORMANCY_FIELDS = ["fromMonth", "fromDay", "untilMonth", "untilDay"] as const;
/** The zero-based page of the dormancy period (see `ProfileFields`). */
const DORMANCY_PAGE = 2;

/** The address with the page of the fields: the page is its index, since each page is one entry; page 0 has no part. */
function withPage(params: URLSearchParams, index: number): URLSearchParams {
  const next = new URLSearchParams(params);
  dropPageParts(next, LAYER_PARAM);
  if (index > 0) next.set(LAYER_PARAM, String(index));
  return next;
}

/** The care profile of one species: catalog value and my deviation per field (US-BES-09). */
export function CareProfileCard(props: {
  entry: CareProfileEntry;
  lists: Lists;
  busy: boolean;
  onSave: Save;
}) {
  const { entry, busy } = props;
  const [params, setParams] = useSearchParams();
  const location = useLocation();
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
      // The dormancy fields are on their own page: show that page, so the message is seen (P-10).
      setParams(withPage(params, DORMANCY_PAGE), { replace: true, state: location.state });
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
          {/* The bar of the layer holds "Abbrechen" and the one save; it is filled once a value changed (US-QS-32, issue 1969). */}
          <FormBar
            formId={formId}
            confirmName={`Sichern: ${name}`}
            disabled={busy || !(outcome.changes || outcome.problem)}
          >
            Sichern
          </FormBar>
          <ProfileFields shared={shared} lists={props.lists} name={name} />
        </FormRoot>
      </Form>
    </section>
  );
}
