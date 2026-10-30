import { zodResolver } from "@hookform/resolvers/zod";
import { localToday } from "@pflanzendex/core";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { currentTimeZone } from "@/kernel";
import { cn } from "@/lib/utils";
import { CourseFields, TermFields } from "../../../treatment-form/treatment-form";
import type { TreatableSpecimen, TreatmentInput } from "../../../../shared/api/treatments-api";
import {
  toTreatmentInput,
  treatmentDefaults,
  treatmentSchema,
  type TreatmentFields,
} from "../../../../shared/schemas";
import { SpecimenPicker } from "../specimen-picker/specimen-picker";

/** The id of the form: the save button of the layer's footer submits it from outside, so it stays in view (US-QS-15). */
export const PLAN_FORM_ID = "plan-treatment-form";

type View = "pick" | "terms";
/** The fields in the order the form asks for them: the first one that fails decides which view opens. */
const ORDER: readonly (keyof TreatmentFields)[] = [
  "specimenIds",
  "reason",
  "agent",
  "date",
  "count",
  "intervalDays",
];
const viewOf = (field: keyof TreatmentFields): View => (field === "specimenIds" ? "pick" : "terms");

/** The first failing field in the form's order, or none. */
function firstInvalid(errors: FieldErrors<TreatmentFields>): keyof TreatmentFields | null {
  return ORDER.find((name) => errors[name]) ?? null;
}

/**
 * The view of the form and the focus after a refused save: the view of the first failing field opens and that field
 * takes the focus (P-10). A new object per refusal, so the focus moves on every attempt.
 */
function usePlanView(form: UseFormReturn<TreatmentFields>) {
  const [view, setView] = useState<View>("pick");
  const [refused, setRefused] = useState<{ field: keyof TreatmentFields } | null>(null);
  const firstPlant = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!refused) return;
    if (refused.field === "specimenIds") firstPlant.current?.focus();
    else form.setFocus(refused.field);
  }, [refused, form]);
  const onInvalid = (errors: FieldErrors<TreatmentFields>) => {
    const field = firstInvalid(errors);
    if (!field) return;
    setView(viewOf(field));
    setRefused({ field });
  };
  return { view, setView, onInvalid, firstPlant };
}

/**
 * The plan of US-BEH-01 inside the layer: two views, the plants (search, location, pages) and the term (reason, agent,
 * date, course). Both stay mounted, so switching views keeps what was typed.
 */
export function PlanForm(props: {
  specimens: readonly TreatableSpecimen[];
  running: boolean;
  onSend: (input: TreatmentInput) => Promise<boolean>;
}) {
  const today = localToday(new Date(), currentTimeZone());
  const form = useForm<TreatmentFields>({
    resolver: zodResolver(treatmentSchema),
    defaultValues: treatmentDefaults(today),
  });
  const { view, setView, onInvalid, firstPlant } = usePlanView(form);
  const chosen = useWatch({ control: form.control, name: "specimenIds" });
  const submit = form.handleSubmit(async (values) => {
    await props.onSend(toTreatmentInput(values));
  }, onInvalid);
  return (
    <Form {...form}>
      <FormRoot
        id={PLAN_FORM_ID}
        aria-label="Behandlung planen"
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        <SegmentedControl
          label="Teile der Behandlung"
          options={[
            { value: "pick", label: `Pflanzen (${chosen.length})` },
            { value: "terms", label: "Termin" },
          ]}
          value={view}
          onChange={setView}
        />
        {/* Both views stay mounted; the hidden one leaves the page and the accessibility tree. */}
        <div hidden={view !== "pick"} className={cn(view !== "pick" && "hidden")}>
          <SpecimenPicker
            control={form.control}
            specimens={props.specimens}
            focusRef={firstPlant}
          />
        </div>
        <div
          hidden={view !== "terms"}
          className={cn("flex flex-col gap-3", view !== "terms" && "hidden")}
        >
          <TermFields control={form.control} />
          <CourseFields control={form.control} />
        </div>
      </FormRoot>
    </Form>
  );
}
