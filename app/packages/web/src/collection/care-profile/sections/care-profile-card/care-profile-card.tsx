import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useLocation, useSearchParams } from "react-router";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { LAYER_PARAM } from "@/components/shared/responsive/pager/pager";
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

/** The address with the page of the fields: page 0 has no part; the address counts from 1, as the pager does. */
function withPage(params: URLSearchParams, index: number): URLSearchParams {
  const next = new URLSearchParams(params);
  if (index <= 0) next.delete(LAYER_PARAM);
  else next.set(LAYER_PARAM, String(index + 1));
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
      // The dormancy fields are on their own page: show that page, so the message is seen (P-10).
      setParams(withPage(params, DORMANCY_PAGE), { replace: true, state: location.state });
      form.setError(first, { type: "problem", message: result.problem }, { shouldFocus: true });
    } else if (result.changes) {
      props.onSave(result.changes, `Pflegeprofil für „${name}“ gespeichert.`);
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
        <FormRoot onSubmit={submit} className="grid gap-3">
          <ProfileFields shared={shared} lists={props.lists} name={name} />
          {/* Sticky at the bottom of the layer: the one filled action stays in view while the page scrolls (US-QS-15). */}
          <Button
            type="submit"
            size="touch"
            className="sticky bottom-0 z-10 bg-background"
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
