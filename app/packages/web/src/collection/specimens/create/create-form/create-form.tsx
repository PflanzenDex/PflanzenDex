import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { speciesDisplayName, type Species, type LightLocation } from "@pflanzendex/core";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import type { ApiError } from "../../../../kernel";
import {
  refusesCatchDate,
  useToday,
} from "../../../markers/catch-date/catch-date-field/catch-date-field";
import { Heading, NamePreview, OtherFields } from "../create-fields/create-fields";
import { toCreateInput, type CreateInput } from "../create-input";
import {
  MarkerFields,
  markerRule,
  type Sibling,
} from "../../../markers/marker/marker-fields/marker-fields";
import { FormButtons, Warning } from "../../cards/parts/parts";
import { useEdited, useRefusal } from "../../model/refusal";
import { createSchema, type CreateFields } from "../../model/schemas";
import { nameConflict } from "../../model/text";

/** The fields a refusal points at: the catch date by its detail, a taken marker at the marker (US-BES-02, US-BES-03). */
function fieldsOfRefusal(error: ApiError): (keyof CreateFields)[] {
  if (refusesCatchDate(error)) return ["catchDate"];
  return error.code === "specimen.marker_taken" ? ["marker"] : [];
}

function ErrorBox({ text, error }: { text: string; error: ApiError }) {
  const conflict = nameConflict(error);
  return (
    <Warning>
      <p>{text}</p>
      {conflict && (
        <>
          {conflict.existing.map((v) => (
            <p key={v.id}>Schon vorhanden: {v.name}</p>
          ))}
          <p>Mit einem Kennzeichen heißt das neue Exemplar dann „{conflict.name} – Kennzeichen“.</p>
        </>
      )}
    </Warning>
  );
}

/** The input to send; the catch date counts as chosen only when the keeper changed the field (FR-BES-04, #306). */
const inputOf = (
  form: UseFormReturn<CreateFields>,
  values: CreateFields,
  missing: readonly { id: string }[],
) => toCreateInput(values, missing, form.getFieldState("catchDate").isDirty);

/**
 * Create specimen (US-BES-02, US-BES-03): only the species is required for the first specimen. The name is fixed
 * before saving and is already shown here (DM-BES-03). From the second specimen on the marker is required (preset
 * "Klammer"); from the third on the form asks for the markers that existing specimens still miss, before it saves.
 * The location is unknown until the keeper chooses one, since a target location is supplied only by the care phase
 * (PHA); none of it is invented (P-08).
 */
export function CreateForm(props: {
  species: Species;
  /** The active specimens of this species (from the cards). */
  siblings: readonly Sibling[];
  locations: readonly LightLocation[];
  onSend: (input: CreateInput) => Promise<ApiError | null>;
  onCancel: () => void;
  errorStart?: ApiError;
}) {
  const rule = markerRule(props.siblings);
  const today = useToday();
  const [error, setError] = useState<ApiError | null>(props.errorStart ?? null);
  const form = useForm<CreateFields>({
    resolver: zodResolver(createSchema(rule)),
    defaultValues: {
      marker: rule.required ? rule.preset : "",
      answers: Object.fromEntries(rule.missing.map((s) => [s.id, ""])),
      cutting: false,
      locationId: "",
      catchDate: today,
    },
  });
  const alertText = useRefusal(error, form.setError, fieldsOfRefusal);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const speciesName = speciesDisplayName(props.species);
  const submit = form.handleSubmit(async (values) =>
    setError(await props.onSend(inputOf(form, values, rule.missing))),
  );
  return (
    <section aria-labelledby="create-title">
      <Heading species={props.species} />
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Exemplar anlegen"
          className="flex max-w-xl flex-col gap-4"
        >
          <NamePreview control={form.control} speciesName={speciesName} />
          <MarkerFields
            control={form.control}
            speciesName={speciesName}
            required={rule.required}
            missing={rule.missing}
          />
          <OtherFields control={form.control} locations={props.locations} today={today} />
          {error && alertText !== null && <ErrorBox text={alertText} error={error} />}
          <FormButtons
            submit="Exemplar anlegen"
            cancel="Zurück zur Art"
            pending={form.formState.isSubmitting}
            onCancel={props.onCancel}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
