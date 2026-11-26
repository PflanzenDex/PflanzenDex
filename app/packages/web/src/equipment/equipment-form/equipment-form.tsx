import { useEffect, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormReturn } from "react-hook-form";
import { FormBar } from "@/shared/ui/form-bar";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { FormMoreFields } from "@/shared/ui/form.more-fields";
import { useServerRefusal } from "@/shared/ui/form.server-refusal";
import { FormNotices } from "@/shared/patterns/elements/form-notices/form-notices";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { ApiError } from "../../shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import { OPTIONAL_FIELDS, OptionalFields, RequiredFields, ZoneField } from "./fields/fields";
import { PotFields } from "./pot-fields/pot-fields";
import table from "../equipment.de.json";
import {
  EMPTY_FIELDS,
  equipmentSchema,
  fieldsOfRefusal,
  toEquipmentInput,
  type EquipmentFields,
} from "../schemas";
import type { EquipmentInput } from "../equipment-api";
import type { EquipmentPrefill } from "../overviews/wishes-view/wishes-api";

/**
 * What the form takes over: "Gekauft" on an equipment wish (US-EQU-08) and, for a lamp that a need names, its light zone
 * (US-EQU-07, US-QS-32). The zone is left out by the wish, so it stays empty there (P-08).
 */
export type EquipmentFill = EquipmentPrefill & { readonly lightZoneId?: string | null };

/** "Gekauft" on an equipment wish fills the form with what the wish knows (US-EQU-08); the rest stays empty (P-08). */
function usePrefill(
  form: UseFormReturn<EquipmentFields>,
  prefill: EquipmentFill | null | undefined,
) {
  useEffect(() => {
    if (!prefill) return;
    form.reset({
      ...EMPTY_FIELDS,
      type: prefill.type,
      name: prefill.name,
      productId: prefill.productId ?? "",
      priceEur: prefill.priceEur === null ? "" : String(prefill.priceEur).replace(".", ","),
      lightZoneId: prefill.lightZoneId ?? "",
    });
  }, [prefill, form]);
}

const t = texts(table);

/** The form to record equipment (US-EQU-01): only type and name are required, the rest stays unknown (P-08). */
export function EquipmentForm(props: {
  zones: readonly { zoneId: string; name: string }[];
  /** Set by "Gekauft" on an equipment wish: fills type, name, product id and price (US-EQU-08). */
  prefill?: EquipmentFill | null;
  running: boolean;
  message: string | null;
  error: ApiError | null;
  /** Resolves true when the equipment was saved, so the form can be emptied. */
  onSend: (input: EquipmentInput) => Promise<boolean>;
}) {
  const formId = useId();
  const form = useFieldForm<EquipmentFields>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: EMPTY_FIELDS,
  });
  const { alertText, alertRef } = useServerRefusal(props.error, form.setError, fieldsOfRefusal);
  usePrefill(form, props.prefill);
  // Typed input that is not saved asks before the layer closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);
  const refused = Object.keys(form.formState.errors).length > 0;
  const pending = props.running || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    if (await props.onSend(toEquipmentInput(values))) form.reset(EMPTY_FIELDS);
  });
  // No heading here: the layer "Neues Equipment" already names the form (US-QS-24, issue 1032).
  return (
    <section aria-label={t("form.label")} className="flex flex-col gap-3">
      <FormNotices
        message={refused ? null : props.message}
        alertText={alertText}
        alertRef={alertRef}
        onDismiss={props.error?.dismiss}
      />
      <Form {...form}>
        <FormRoot id={formId} onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <RequiredFields control={form.control} />
          <ZoneField control={form.control} zones={props.zones} />
          <PotFields control={form.control} />
          <FormMoreFields control={form.control} names={OPTIONAL_FIELDS}>
            <OptionalFields control={form.control} />
          </FormMoreFields>
          {/* The save stands after the last field with "Abbrechen", in the bar of a phone sheet, never in a sticky footer (US-QS-32, SG-SHEET-04, issue 1941). */}
          <FormBar formId={formId} pending={pending} pendingText={t("form.saving")}>
            {t("form.save")}
          </FormBar>
        </FormRoot>
      </Form>
    </section>
  );
}
