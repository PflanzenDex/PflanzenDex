import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Button } from "@/shared/ui/button/button";
import { Form, FormRoot } from "@/shared/ui/fields/form/form";
import { FormMoreFields } from "@/shared/ui/fields/form/more-fields/more-fields";
import { useServerRefusal } from "@/shared/ui/fields/form/server-refusal";
import { FormNotices } from "@/shared/patterns/elements/form-notices/form-notices";
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

/** "Gekauft" on an equipment wish fills the form with what the wish knows (US-EQU-08); the rest stays empty (P-08). */
function usePrefill(
  form: UseFormReturn<EquipmentFields>,
  prefill: EquipmentPrefill | null | undefined,
) {
  useEffect(() => {
    if (!prefill) return;
    form.reset({
      ...EMPTY_FIELDS,
      type: prefill.type,
      name: prefill.name,
      productId: prefill.productId ?? "",
      priceEur: prefill.priceEur === null ? "" : String(prefill.priceEur).replace(".", ","),
    });
  }, [prefill, form]);
}

const t = texts(table);

/** Sticky: the form may scroll inside the layer while the save button stays visible. */
function SaveBar({ pending }: { pending: boolean }) {
  return (
    <div className="sticky bottom-0 bg-card py-2">
      <Button type="submit" size="touch" className="w-full" disabled={pending}>
        {pending ? t("form.saving") : t("form.save")}
      </Button>
    </div>
  );
}

/** The form to record equipment (US-EQU-01): only type and name are required, the rest stays unknown (P-08). */
export function EquipmentForm(props: {
  zones: readonly { zoneId: string; name: string }[];
  /** Set by "Gekauft" on an equipment wish: fills type, name, product id and price (US-EQU-08). */
  prefill?: EquipmentPrefill | null;
  running: boolean;
  message: string | null;
  error: ApiError | null;
  /** Resolves true when the equipment was saved, so the form can be emptied. */
  onSend: (input: EquipmentInput) => Promise<boolean>;
}) {
  const form = useForm<EquipmentFields>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: EMPTY_FIELDS,
  });
  const { alertText, alertRef } = useServerRefusal(props.error, form.setError, fieldsOfRefusal);
  usePrefill(form, props.prefill);
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
      />
      <Form {...form}>
        <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <RequiredFields control={form.control} />
          <ZoneField control={form.control} zones={props.zones} />
          <PotFields control={form.control} />
          <FormMoreFields control={form.control} names={OPTIONAL_FIELDS}>
            <OptionalFields control={form.control} />
          </FormMoreFields>
          <SaveBar pending={pending} />
        </FormRoot>
      </Form>
    </section>
  );
}
