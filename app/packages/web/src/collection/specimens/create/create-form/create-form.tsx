import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormReturn } from "react-hook-form";
import {
  speciesDisplayName,
  type Species,
  type LightLocation,
  type LightZone,
} from "@pflanzendex/core";
import { FormBar } from "@/shared/ui/form-bar";
import { FormBarRegion } from "@/shared/ui/form-bar.page";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { isKeyConflict, type ApiError } from "../../../../shared/data";
import { refusesCatchDate } from "../../../markers/catch-date/catch-date-field/catch-date-field";
import { useToday } from "../../../markers/catch-date/use-today";
import { NamePreview, OtherFields, SpeciesLine } from "../create-fields/create-fields";
import { toCreateInput, type CreateInput } from "../create-input";
import { MarkerFields } from "../../../markers/marker/marker-fields/marker-fields";
import { markerRule, type Sibling } from "../../../markers/marker/marker-rule";
import { ErrorNotice } from "../../cards/parts/parts";
import { useEdited, useRefusal } from "../../model/refusal";
import { createSchema, type CreateFields } from "../../model/schemas";
import { createStart } from "../../model/create-start";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./create-form.de.json";
import { nameConflict } from "../../model/text";

const ui = texts(table);

/** The id of the create form; its bar submits it through the `form` attribute (US-BES-02, SG-SHEET-04). */
const FORM_ID = "create-form";

/**
 * The bar of the form "Pflanze anlegen" (US-QS-32, SG-SHEET-04, owner decision d-056): "Abbrechen" leaves to the species
 * choice, "Pflanze anlegen" sends the form. It is the last part of the form: at the top of the page below md, after the last
 * field from md (owner decision d-060).
 */
function CreateBar(props: { pending: boolean; onCancel: () => void }) {
  return (
    <FormBar formId={FORM_ID} pending={props.pending} needsNetwork onCancel={props.onCancel}>
      {ui("submit")}
    </FormBar>
  );
}

/** The fields a refusal points at: the catch date by its detail, a taken marker at the marker (US-BES-02, US-BES-03). */
function fieldsOfRefusal(error: ApiError): (keyof CreateFields)[] {
  if (refusesCatchDate(error)) return ["catchDate"];
  if (error.code === "light_zone.not_found") return ["lightZoneId"];
  return error.code === "specimen.marker_taken" ? ["marker"] : [];
}

/** A key conflict keeps its one control, which closes it and frees the key (US-QS-03); other refusals stay until acted on. */
function ErrorBox({
  text,
  error,
  onDismiss,
}: {
  text: string;
  error: ApiError;
  onDismiss: () => void;
}) {
  const conflict = nameConflict(error);
  return (
    <ErrorNotice {...(isKeyConflict(error) ? { onDismiss } : {})}>
      <p>{text}</p>
      {conflict && (
        <>
          {conflict.existing.map((v) => (
            <p key={v.id}>{ui("alreadyThere", { name: v.name })}</p>
          ))}
          <p>{ui("withMarker", { name: conflict.name })}</p>
        </>
      )}
    </ErrorNotice>
  );
}

/** The input to send; the catch date counts as chosen only when the keeper changed the field (FR-BES-04, #306). */
const inputOf = (
  form: UseFormReturn<CreateFields>,
  values: CreateFields,
  missing: readonly { id: string }[],
) => toCreateInput(values, missing, form.getFieldState("catchDate").isDirty);

/** The header of the form (US-QS-32): the title in the bar below md, the species as the subject line, the way back. */
function CreateHeader(props: { species: Species; onBack: () => void }) {
  return (
    <PageHeader
      headingId="create-title"
      title={ui("formLabel")}
      subject={<SpeciesLine species={props.species} />}
      back={{ label: ui("back"), onBack: props.onBack }}
    />
  );
}

/**
 * The refusal the form shows and its close. A key conflict closes with its one control, which frees the key of the create
 * (`release`, US-QS-03); other refusals stay until the keeper acts (P-10).
 */
function useCreateRefusal(start: ApiError | undefined, release: (() => void) | undefined) {
  const [error, setError] = useState<ApiError | null>(start ?? null);
  const dismiss = () => {
    setError(null);
    release?.();
  };
  return { error, setError, dismiss };
}

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
  /** The own light zones for the zone field; `failed` says they could not be loaded (US-LIC-02). */
  zones: { items: readonly LightZone[]; failed: boolean };
  onSend: (input: CreateInput) => Promise<ApiError | null>;
  onCancel: () => void;
  errorStart?: ApiError;
  /** Frees the key of the create when the keeper dismisses a key conflict (US-QS-03). */
  onDismissRefusal?: () => void;
}) {
  const rule = markerRule(props.siblings);
  const today = useToday();
  const { error, setError, dismiss } = useCreateRefusal(props.errorStart, props.onDismissRefusal);
  const form = useFieldForm<CreateFields>({
    resolver: zodResolver(createSchema(rule)),
    defaultValues: createStart(rule, today),
  });
  const alertText = useRefusal(error, form.setError, fieldsOfRefusal);
  // Editing takes a refusal away, but a key conflict stays until its banner is dismissed: its text says that the change
  // is not saved yet (US-QS-03).
  useEdited(
    form,
    useCallback(() => setError((e) => (e && isKeyConflict(e) ? e : null)), []),
  );
  const speciesName = speciesDisplayName(props.species);
  const submit = form.handleSubmit(async (values) =>
    setError(await props.onSend(inputOf(form, values, rule.missing))),
  );
  return (
    <section aria-labelledby="create-title" className="flex min-w-0 flex-col gap-2">
      <CreateHeader species={props.species} onBack={props.onCancel} />
      <Form {...form}>
        <FormRoot
          id={FORM_ID}
          onSubmit={submit}
          aria-label={ui("formLabel")}
          className="flex max-w-xl flex-col gap-4"
        >
          <FormBarRegion>
            <NamePreview control={form.control} speciesName={speciesName} />
            <MarkerFields
              control={form.control}
              speciesName={speciesName}
              required={rule.required}
              missing={rule.missing}
            />
            <OtherFields
              control={form.control}
              locations={props.locations}
              zones={props.zones}
              today={today}
            />
            {error && alertText !== null && (
              <ErrorBox text={alertText} error={error} onDismiss={dismiss} />
            )}
            <CreateBar pending={form.formState.isSubmitting} onCancel={props.onCancel} />
          </FormBarRegion>
        </FormRoot>
      </Form>
    </section>
  );
}
